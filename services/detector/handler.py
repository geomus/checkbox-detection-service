import base64

from detection import detect_checkboxes


def handler(event: dict, context: dict) -> dict:
    """Lambda entry point: the only part that touches the outside world.

    ``event`` is the JSON payload the API sends: ``{"imageBase64": str}``. A
    missing or undecodable payload raises, so the caller gets a clean Lambda
    FunctionError rather than a silently empty result.
    """
    image_b64 = event.get("imageBase64")
    if not image_b64:
        raise ValueError("event is missing 'imageBase64'")

    image_bytes = base64.b64decode(image_b64, validate=True)
    return {"boxes": detect_checkboxes(image_bytes)}
