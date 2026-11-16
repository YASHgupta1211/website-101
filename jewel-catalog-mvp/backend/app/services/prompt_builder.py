
def build_catalog_prompt(preferences: dict) -> str:
    """
    Build an image-generation prompt using customer preferences.
    """

    model_type = preferences.get("model_type", "Female")
    age_range = preferences.get("age_range", "Young adult")
    skin_tone = preferences.get("skin_tone", "Choose for me")
    outfit = preferences.get("outfit", "Traditional")
    background = preferences.get("background", "Luxury studio")

    if model_type == "Product only":
        return f"""
Create a premium, photorealistic product-only jewelry catalog photograph.

CUSTOMER PREFERENCES:
- Model type: Product only
- Background: {background}

JEWELRY PRESERVATION - HIGHEST PRIORITY:
- Treat the uploaded photograph as the exact product reference.
- Preserve the original design, shape, proportions, metal colour and fine details.
- Preserve the number, position, size and appearance of all stones and settings.
- Do not add, remove, redesign or invent jewelry components.

PRODUCT PRESENTATION:
- Show only the uploaded jewelry, with no person, face, hands or clothing.
- Use the requested background, professional studio lighting and realistic shadows.
- Keep the complete product sharp, prominent and clearly visible.
- No text, watermarks, logos, additional jewelry or unnecessary props.
- Do not compromise jewelry accuracy for artistic styling.
"""

    return f"""
Create a premium, photorealistic Indian jewelry catalog photograph.

CUSTOMER PREFERENCES:
- Model type: {model_type}
- Age range: {age_range}
- Skin tone: {skin_tone}
- Outfit style: {outfit}
- Background: {background}

JEWELRY PRESERVATION — HIGHEST PRIORITY:
- Treat the uploaded photograph as the exact product reference.
- Preserve the jewelry's original design, shape, proportions and dimensions.
- Preserve the number, position, size and appearance of all stones.
- Preserve metal colour, settings, prongs, links and fine details.
- Do not add, remove, redesign or invent jewelry components.
- Do not change the identity of the jewelry product.

MODEL AND STYLING:
- Use an Indian model appropriate to the selected model type and age range.
- Respect the requested skin tone.
- Select outfit colours that complement the jewelry.
- Ensure clothing does not obscure the jewelry.
- Use a natural and elegant pose that clearly showcases the product.

BACKGROUND AND LIGHTING:
- Create a background consistent with the requested style.
- Use professional studio-quality lighting.
- Maintain realistic shadows, reflections and skin texture.
- Ensure sufficient contrast between the jewelry and background.

IMAGE QUALITY:
- Produce a photorealistic commercial jewelry catalog image.
- Keep the jewelry sharp and visually prominent.
- Maintain realistic anatomy and natural proportions.
- Avoid artificial-looking skin and distorted jewelry.

RESTRICTIONS:
- No text, watermarks, logos or additional jewelry.
- No unnecessary props.
- Do not compromise jewelry accuracy for artistic styling.

This is a non-sexual commercial product-photography task.
"""
