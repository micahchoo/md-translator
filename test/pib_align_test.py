# The sentence splitter and number check in bench/pib-align.py. No model is loaded.
#
#   uv run --no-project --with pytest pytest -p no:cacheprovider test/pib_align_test.py
import importlib.util
import sys
from pathlib import Path

# Loading the script must leave nothing in bench/: test/readme.test.ts asks every file there to be documented.
sys.dont_write_bytecode = True

spec = importlib.util.spec_from_file_location("pib_align", Path(__file__).parent.parent / "bench" / "pib-align.py")
pa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pa)


def test_english_titles_initials_and_lowercase_continuations_do_not_end_a_sentence():
    text = "Union Minister Dr. Mansukh Mandaviya inaugurated it. It is important. Shri P. K. Mishra and Rs. 500 crore etc. were present."
    assert pa.sentences(text) == [
        "Union Minister Dr. Mansukh Mandaviya inaugurated it.",
        "It is important.",
        "Shri P. K. Mishra and Rs. 500 crore etc. were present.",
    ]


def test_marathi_title_and_initial_hold_but_a_short_verb_still_ends_the_sentence():
    text = "केंद्रीय मंत्री डॉ. मनसुख मांडविया यांनी उद्घाटन केले. हे महत्त्वाचे आहे. एल. मुरुगन उपस्थित होते."
    assert pa.sentences(text) == [
        "केंद्रीय मंत्री डॉ. मनसुख मांडविया यांनी उद्घाटन केले.",
        "हे महत्त्वाचे आहे.",
        "एल. मुरुगन उपस्थित होते.",
    ]


def test_kannada():
    text = "ಕೇಂದ್ರ ಸಚಿವ ಡಾ. ಮನ್ಸುಖ್ ಮಾಂಡವೀಯ ಉದ್ಘಾಟಿಸಿದರು. ಇದು ಮುಖ್ಯ ಎಂದರು. ಎಲ್. ಮುರುಗನ್ ಹಾಜರಿದ್ದರು."
    assert pa.sentences(text) == ["ಕೇಂದ್ರ ಸಚಿವ ಡಾ. ಮನ್ಸುಖ್ ಮಾಂಡವೀಯ ಉದ್ಘಾಟಿಸಿದರು.", "ಇದು ಮುಖ್ಯ ಎಂದರು.", "ಎಲ್. ಮುರುಗನ್ ಹಾಜರಿದ್ದರು."]


def test_tamil():
    text = "மத்திய அமைச்சர் திரு. எல். முருகன் தொடங்கி வைத்தார். இது முக்கியம் ஆகும். ரூ. 500 கோடி ஒதுக்கப்பட்டது."
    assert pa.sentences(text) == ["மத்திய அமைச்சர் திரு. எல். முருகன் தொடங்கி வைத்தார்.", "இது முக்கியம் ஆகும்.", "ரூ. 500 கோடி ஒதுக்கப்பட்டது."]


def test_punjabi_ends_at_the_danda_and_keeps_its_title_and_initial():
    text = "ਕੇਂਦਰੀ ਮੰਤਰੀ ਡਾ. ਮਨਸੁਖ ਮਾਂਡਵੀਆ ਨੇ ਉਦਘਾਟਨ ਕੀਤਾ। ਇਹ ਅਹਿਮ ਹੈ। ਐੱਲ. ਮੁਰੂਗਨ ਮੌਜੂਦ ਸਨ।"
    assert pa.sentences(text) == ["ਕੇਂਦਰੀ ਮੰਤਰੀ ਡਾ. ਮਨਸੁਖ ਮਾਂਡਵੀਆ ਨੇ ਉਦਘਾਟਨ ਕੀਤਾ।", "ਇਹ ਅਹਿਮ ਹੈ।", "ਐੱਲ. ਮੁਰੂਗਨ ਮੌਜੂਦ ਸਨ।"]


def test_a_sentence_may_begin_with_a_number():
    text = "ಸಮ್ಮೇಳನ ಇಂದು ಮುಕ್ತಾಯಗೊಂಡಿತು. 2025ರ ನವೆಂಬರ್ 27ರಂದು ಆರಂಭವಾಗಿತ್ತು."
    assert pa.sentences(text) == ["ಸಮ್ಮೇಳನ ಇಂದು ಮುಕ್ತಾಯಗೊಂಡಿತು.", "2025ರ ನವೆಂಬರ್ 27ರಂದು ಆರಂಭವಾಗಿತ್ತು."]
    assert pa.sentences("It closed today. 2025 was a record year.") == ["It closed today.", "2025 was a record year."]


def test_a_dotted_abbreviation_does_not_end_a_sentence():
    assert pa.sentences("दूरी 5 कि.मी. है। आगे बढ़ें।") == ["दूरी 5 कि.मी. है।", "आगे बढ़ें।"]


def test_a_decimal_or_a_date_can_end_a_sentence():
    assert pa.sentences("Growth was (17.92%). Top states follow.") == ["Growth was (17.92%).", "Top states follow."]
    assert pa.sentences("It is dated 29.10.2025. This applies now.") == ["It is dated 29.10.2025.", "This applies now."]


def test_numbers_read_every_script_and_ignore_grouping_commas():
    assert pa.numbers("Rs 4,500 on 28 November 2025") == ["2025", "28", "4500"]
    assert pa.numbers("४,५०० रुपये, 28 नवंबर २०२५") == ["2025", "28", "4500"]
    assert pa.numbers("১,০০,০০০ টাকা") == ["100000"]
    assert pa.numbers("in 2024 2025 and 2026") == ["2024", "2025", "2026"]


def test_numbers_count_millions_and_lakhs_alike():
    # 6.3 million is 63 lakh; 4,500 crore is 45 billion. Seen in the pilot as false disagreements.
    assert pa.numbers("over 6.3 million Scouts") == pa.numbers("63 लाखांहून अधिक बालवीर") == ["6300000"]
    assert pa.numbers("Rs 45 billion") == pa.numbers("₹4,500 करोड़") == pa.numbers("4,500 கோடி") == ["45000000000"]
    assert pa.numbers("2.4 million girls") == pa.numbers("24 ಲಕ್ಷಕ್ಕೂ ಹೆಚ್ಚು") == ["2400000"]
    # Kannada's "ten lakh", and the English words written in the other scripts.
    assert pa.numbers("357 million tonnes") == pa.numbers("357 ದಶಲಕ್ಷ ಟನ್") == pa.numbers("357 मिलियन टन") == ["357000000"]
    assert pa.numbers("$5 billion") == pa.numbers("5 பில்லியன் டாலர்") == ["5000000000"]


def test_numbers_agree_only_says_something_when_a_side_has_numbers():
    assert pa.numbers_agree("Rs 4,500 crore in 2025", "२०२५ में ४,५०० करोड़") is True
    assert pa.numbers_agree("Rs 4,500 crore in 2025", "२०२४ में ४,५०० करोड़") is False
    assert pa.numbers_agree("It is important.", "यह महत्वपूर्ण है।") is None
