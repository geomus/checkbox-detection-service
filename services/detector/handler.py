import base64

from detection import detect_checkboxes


def handler(event: dict, context) -> dict:
    """Lambda entry point: the only part that touches the outside world.

    ``event`` is the JSON payload the API sends: ``{"imageBase64": str}``. The
    API Lambda is the only caller and it already validates the upload and caps
    its size, so this handler trusts its input and only guards a missing or
    undecodable payload, raising so the caller gets a clean Lambda FunctionError
    instead of a silently empty result.
    """
    image_b64 = event.get("imageBase64")
    if not image_b64:
        raise ValueError("event is missing 'imageBase64'")

    image_bytes = base64.b64decode(image_b64, validate=True)
    return {"boxes": detect_checkboxes(image_bytes)}
