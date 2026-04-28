from app.schemas import CloudAnalysisResponse


def mock_ai_analysis(image_url: str, page_url: str | None) -> CloudAnalysisResponse:
    hostname_hint = page_url or image_url
    return CloudAnalysisResponse(
        description="Mock cloud analysis: likely a web image suitable for source and reuse investigation.",
        likely_objects=["primary subject", "background context", "possible watermark or crop"],
        likely_source_hints=[
            "Check exact-match reverse image engines first.",
            f"Compare against page context: {hostname_hint[:100]}",
            "Try descriptive keyword searches if exact matches are sparse.",
        ],
        suggested_queries=[
            "exact image source",
            "original image upload",
            "similar image higher resolution",
        ],
    )
