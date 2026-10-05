# /// script
# requires-python = ">=3.10,<3.13"
# dependencies = ["onnxruntime", "pillow", "numpy", "sacrebleu"]
# ///
"""Whether a layout model should find a page's text before Tesseract reads it.

    uv run bench/ocr-layout.py [designed] [books] [--egret]

Readings of every page, on designed pages (ocr-designed.ts) and on books (the
Wikisource pages from ocr-pages.ts):
    whole   Tesseract's own layout
    ppdl    PP-DocLayout-S regions (public/models), each read on its own (Otsu,
            enlarged where the lines are short, a margin that stops short of
            its neighbours), then Tesseract's own layout on what they left,
            kept only where sure on the whole; in XY-cut order
    egret   docling-layout-egret-medium the same way (--egret; corpus/egret/)
and, for ppdl, the routing rules: layout only where the model finds a picture,
or text in two columns. Native Tesseract with the tessdata_fast models, Sauvola
and the language's model; designed pages add English's. chrF against each
page's reference. Readings are kept in corpus/runs/ocr/layout-<set>.json.
The brochure that found the layout fault is not in the repository.
"""
import collections, glob, json, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
import numpy as np, onnxruntime as ort
from PIL import Image, ImageDraw
from sacrebleu.metrics import CHRF

C = 'corpus'
T = C + '/tessdata-fast'
MODEL = {'en': 'eng', 'as': 'asm', 'bn': 'ben', 'gu': 'guj', 'hi': 'hin', 'kn': 'kan', 'ml': 'mal', 'mr': 'mar', 'or': 'ori', 'pa': 'pan', 'sa': 'san', 'ta': 'tam', 'te': 'tel'}
PAD = 24
CROPS = 'corpus/ocr-crops'
os.makedirs(CROPS, exist_ok=True)

ppdl = ort.InferenceSession('public/models/pp-doclayout-s.onnx')
PPDL_LABELS = "paragraph_title image text number abstract content figure_title formula table table_title reference doc_title footnote header algorithm footer seal chart_title chart formula_number header_image footer_image aside_text".split()
PPDL_SKIP = {'image', 'chart', 'seal', 'header_image', 'footer_image', 'formula'}
egret = ort.InferenceSession(C + '/egret/model.onnx') if '--egret' in sys.argv else None
EGRET_LABELS = ['Caption', 'Footnote', 'Formula', 'List-item', 'Page-footer', 'Page-header', 'Picture', 'Section-header', 'Table', 'Text', 'Title', 'Document Index', 'Code', 'Checkbox-Selected', 'Checkbox-Unselected', 'Form', 'Key-Value Region']
EGRET_SKIP = {'Picture', 'Formula', 'Checkbox-Selected', 'Checkbox-Unselected'}

def detect_ppdl(im, thresh=0.25):
    W, H = im.size
    x = np.asarray(im.resize((480, 480), Image.BICUBIC), dtype=np.float32) / 255.0
    x = ((x - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]).transpose(2, 0, 1)[None].astype(np.float32)
    out = ppdl.run(None, {'image': x, 'scale_factor': np.array([[480 / H, 480 / W]], np.float32)})[0]
    return [dict(label=PPDL_LABELS[int(c)], score=float(s), box=[float(a), float(b), float(cc), float(d)]) for c, s, a, b, cc, d in out if s >= thresh and PPDL_LABELS[int(c)] not in PPDL_SKIP]

def detect_egret(im, thresh=0.3):
    W, H = im.size
    x = (np.asarray(im.resize((640, 640), Image.BICUBIC), dtype=np.float32) / 255.0).transpose(2, 0, 1)[None]
    logits, boxes = egret.run(None, {'pixel_values': x})
    prob = 1 / (1 + np.exp(-logits[0]))
    out = []
    for q in range(prob.shape[0]):
        c = int(prob[q].argmax()); s = float(prob[q, c])
        if s < thresh or EGRET_LABELS[c] in EGRET_SKIP: continue
        cx, cy, w, h = boxes[0, q]
        out.append(dict(label=EGRET_LABELS[c], score=s, box=[(cx - w / 2) * W, (cy - h / 2) * H, (cx + w / 2) * W, (cy + h / 2) * H]))
    return out

def inside(a, b):
    ix = max(0, min(a[2], b[2]) - max(a[0], b[0])); iy = max(0, min(a[3], b[3]) - max(a[1], b[1]))
    return ix * iy / max(1, (a[2] - a[0]) * (a[3] - a[1]))

def xycut(regions):
    """XY-cut as the page does it: cut at the single widest gap, across or down, and recurse."""
    if len(regions) <= 1: return regions
    best = None
    for axis in (1, 0):
        rs = sorted(regions, key=lambda r: r['box'][axis]); end = rs[0]['box'][axis + 2]
        for r in rs[1:]:
            gap = r['box'][axis] - end
            if gap >= 0 and (best is None or gap > best[0]): best = (gap, axis, r['box'][axis])
            end = max(end, r['box'][axis + 2])
    if best is None: return sorted(regions, key=lambda r: (r['box'][1], r['box'][0]))
    _, axis, at = best
    return xycut([r for r in regions if r['box'][axis] < at]) + xycut([r for r in regions if r['box'][axis] >= at])

def tsv(path, model, psm, thresh='2'):
    """Tesseract's paragraphs with box, a sure word, mean confidence; and the median line height."""
    out = subprocess.run(['tesseract', path, '-', '-l', model, '--psm', str(psm), '--tessdata-dir', T, '-c', f'thresholding_method={thresh}', '-c', 'tessedit_create_tsv=1'], capture_output=True, text=True).stdout
    paras = collections.OrderedDict(); heights = []
    for line in out.splitlines()[1:]:
        f = line.split('\t')
        if len(f) < 12: continue
        if f[0] == '4': heights.append(int(f[9]))
        if f[0] != '5' or not f[11].strip(): continue
        x, y, w, h, conf = int(f[6]), int(f[7]), int(f[8]), int(f[9]), float(f[10])
        p = paras.setdefault((f[2], f[3]), {'words': [], 'confs': [], 'box': [x, y, x + w, y + h]})
        p['words'].append(f[11]); p['confs'].append(conf)
        b = p['box']; p['box'] = [min(b[0], x), min(b[1], y), max(b[2], x + w), max(b[3], y + h)]
    ps = [{'box': p['box'], 'text': ' '.join(p['words']), 'sure': max(p['confs']) >= 60, 'mean': sum(p['confs']) / len(p['confs'])} for p in paras.values()]
    heights.sort()
    return [p for p in ps if p['sure']], (heights[len(heights) // 2] if heights else 0)

LINE = 36       # the line height Tesseract reads best at, roughly
REST_MEAN = 60  # where the model saw no text, Tesseract must be this sure on the whole

def read(img, path, model, psm, thresh):
    """Read; if the lines come back much shorter than LINE, read again enlarged to it."""
    img.save(path); ps, h = tsv(path, model, psm, thresh)
    if 0 < h < LINE * 0.75:
        f = min(3.0, LINE / h)
        img.resize((round(img.width * f), round(img.height * f)), Image.LANCZOS).save(path)
        ps, _ = tsv(path, model, psm, thresh)
        for p in ps: p['box'] = [v / f for v in p['box']]
    return ps

def whole(path, model):
    return '\n\n'.join(p['text'] for p in tsv(path, model, 3)[0])

def margins(r, kept, W, H):
    """A crop round region r: PAD on each side, cut to half the gap to any text
    region beside it, so a crop never reads a neighbour's lines."""
    x1, y1, x2, y2 = r['box']; m = [PAD] * 4
    for k in kept:
        if k is r: continue
        a, b, c, d = k['box']
        if a < x2 and c > x1:  # overlaps across: above or below
            if d <= y1: m[1] = min(m[1], (y1 - d) / 2)
            if b >= y2: m[3] = min(m[3], (b - y2) / 2)
        if b < y2 and d > y1:  # overlaps down: left or right
            if c <= x1: m[0] = min(m[0], (x1 - c) / 2)
            if a >= x2: m[2] = min(m[2], (a - x2) / 2)
    return (max(0, x1 - m[0]), max(0, y1 - m[1]), min(W, x2 + m[2]), min(H, y2 + m[3]))

def layout(path, model, detect, tag):
    im = Image.open(path).convert('RGB')
    kept = []
    for r in sorted(detect(im), key=lambda r: -r['score']):
        r['box'] = [max(0, r['box'][0]), max(0, r['box'][1]), min(im.width, r['box'][2]), min(im.height, r['box'][3])]
        if r['box'][2] - r['box'][0] < 8 or r['box'][3] - r['box'][1] < 8: continue
        if all(inside(r['box'], k['box']) < 0.5 and inside(k['box'], r['box']) < 0.5 for k in kept): kept.append(r)
    for i, r in enumerate(kept):
        # One background in a region: Otsu's one threshold, steadier than Sauvola's on a crop.
        crop = im.crop(tuple(int(v) for v in margins(r, kept, im.width, im.height)))
        r['text'] = '\n\n'.join(p['text'] for p in read(crop, f'{CROPS}/{tag}-{i}.png', model, 6, '0'))
    m = im.copy(); d = ImageDraw.Draw(m)
    for r in kept: d.rectangle([r['box'][0] - 4, r['box'][1] - 4, r['box'][2] + 4, r['box'][3] + 4], fill='white')
    rest = [p for p in read(m, f'{CROPS}/{tag}-rest.png', model, 3, '2') if p['mean'] >= REST_MEAN and all(inside(p['box'], k['box']) < 0.3 for k in kept)]
    return '\n\n'.join(r['text'] for r in xycut(kept + rest) if r['text'])

def pages(kind):
    if kind == 'designed':
        for path in sorted(glob.glob(f'{C}/ocr-designed/*/*.png')):
            code = path.split('/')[-2]
            yield code, path, open(path[:-4] + '.txt').read(), (MODEL[code] + '+eng' if code != 'en' else 'eng')
    else:
        for path in sorted(glob.glob(f'{C}/ocr-pages/*/*.txt')):
            code = path.split('/')[-2]
            img = next(p for p in glob.glob(path[:-4] + '.*') if p.endswith(('.jpg', '.png')))
            yield code, img, open(path).read(), MODEL[code]

PICTURES = {'image', 'chart', 'header_image', 'footer_image'}

def features(img):
    """Pictures the model is sure of, and how many columns its sure text regions make."""
    im = Image.open(img).convert('RGB'); W, H = im.size
    x = np.asarray(im.resize((480, 480), Image.BICUBIC), dtype=np.float32) / 255.0
    x = ((x - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]).transpose(2, 0, 1)[None].astype(np.float32)
    out = ppdl.run(None, {'image': x, 'scale_factor': np.array([[480 / H, 480 / W]], np.float32)})[0]
    rs = [(PPDL_LABELS[int(c_)], float(s), [a, b, cc, d]) for c_, s, a, b, cc, d in out if s >= 0.5]
    text = sorted([r[2] for r in rs if r[0] not in PPDL_SKIP], key=lambda b: b[0])
    cols, end = (1, text[0][2]) if text else (0, 0)
    for b in text[1:]:
        if b[0] >= end: cols += 1
        end = max(end, b[2])
    return {'pictures': sum(r[0] in PICTURES for r in rs), 'columns': cols}

RULES = {
    'never': lambda r: False,
    'always': lambda r: True,
    'a picture': lambda r: r['pictures'] >= 1,
    'two columns': lambda r: r['columns'] >= 2,
    'a picture or two columns': lambda r: r['pictures'] >= 1 or r['columns'] >= 2,
}

def run(kind):
    jobs = list(pages(kind))
    def one(j):
        code, img, ref, model = j
        tag = f"{kind}-{code}-{os.path.basename(img)[:-4]}"
        r = dict(code=code, ref=ref, whole=whole(img, model), ppdl=layout(img, model, detect_ppdl, tag + '-p'), **features(img))
        if egret: r['egret'] = layout(img, model, detect_egret, tag + '-e')
        return r
    with ThreadPoolExecutor(6) as ex: res = list(ex.map(one, jobs))
    json.dump(res, open(f'{C}/runs/ocr/layout-{kind}.json', 'w'), ensure_ascii=False)
    c = CHRF(); by = collections.defaultdict(list)
    for r in res: by[r['code']].append(r)
    arms = ['whole', 'ppdl'] + (['egret'] if egret else [])
    mean = lambda pick: sum(c.corpus_score([pick(r) for r in rows], [[r['ref'] for r in rows]]).score for rows in by.values()) / len(by)
    print(f"== {kind}: {len(res)} pages, mean chrF over {len(by)} languages")
    for a in arms: print(f"  {a:26} {mean(lambda r: r[a]):5.1f}")
    for name, rule in RULES.items():
        print(f"  ppdl where {name:15} {mean(lambda r: r['ppdl'] if rule(r) else r['whole']):5.1f}  (layout on {sum(map(rule, res))}/{len(res)})")

if __name__ == '__main__':
    for kind in [a for a in sys.argv[1:] if not a.startswith('--')] or ['designed', 'books']: run(kind)
