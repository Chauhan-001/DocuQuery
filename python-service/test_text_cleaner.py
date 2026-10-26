from text_cleaner import normalize_text


def test_whitespace():
    assert normalize_text("  Hello   world  ") == "Hello world"


def test_line_endings():
    assert normalize_text("Hello\r\nWorld\rAgain") == (
        "Hello\nWorld\nAgain"
    )


def test_paragraphs():
    assert normalize_text("First paragraph.\n\n\nSecond paragraph.") == (
        "First paragraph.\n\nSecond paragraph."
    )


def test_unicode():
    assert normalize_text("  Café   नमस्ते  ") == "Café नमस्ते"


def test_empty_text():
    assert normalize_text(" \n\t ") == ""


if __name__ == "__main__":
    tests = [
        test_whitespace,
        test_line_endings,
        test_paragraphs,
        test_unicode,
        test_empty_text,
    ]

    for test in tests:
        test()
        print(f"PASS: {test.__name__}")

    print(f"\n{len(tests)}/{len(tests)} tests passed.")