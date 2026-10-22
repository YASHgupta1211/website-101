import base64
import os
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI


# Load the API key from backend/.env
BACKEND_DIR = Path(__file__).resolve().parents[2]
load_dotenv(BACKEND_DIR / ".env")

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def generate_catalog_image(
    input_path: str | Path,
    output_path: str | Path,
) -> None:
    """Edit a jewelry image into a product-catalog image."""

    input_path = Path(input_path)
    output_path = Path(output_path)

    prompt = """
    Edit the provided jewelry photograph for a premium e-commerce catalog. The jewelry should be worn by an Indian male/female model based on the suitability of the jewelery.

    PRESERVE THE JEWELRY:
    - Keep the original design, shape, proportions, and arrangement.
    - Preserve the number, position, and appearance of stones.
    - Preserve the metal color, setting, prongs, links, and fine details.
    - Do not add, remove, redesign, or invent jewelry components.
    This is a non-sexual commercial product-photography task.


    CHANGE ONLY THE PRESENTATION:
    - Replace the background with a clean, premium traditional indian background. 
    - The Indian male/femalemodel should be wearing the jewelry in a natural and elegant manner, with appropriate lighting and shadows.
    - Use soft professional lighting and realistic shadows.
    - Keep the jewelry sharp, photorealistic, and centered.
    - Do not add text, logos, props, or extra jewelry.

    The result should resemble a professional jewelry product photograph.
    """

    output_path.parent.mkdir(parents=True, exist_ok=True)

    with input_path.open("rb") as image_file:
        result = client.images.edit(
            model="gpt-image-2.5-sunburst",
            image=image_file,
            prompt=prompt,
            quality="high",
            output_format="png",
            size="1024x1024",
        )

    image_base64 = result.data[0].b64_json

    if not image_base64:
        raise RuntimeError("The image API returned no image data.")

    image_bytes = base64.b64decode(image_base64)
    output_path.write_bytes(image_bytes)
