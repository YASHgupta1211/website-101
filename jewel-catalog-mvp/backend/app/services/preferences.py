from typing import Literal

from pydantic import BaseModel, ConfigDict


class CatalogPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model_type: Literal["Product only", "Female", "Male"] = "Product only"
    age_range: Literal["Young adult", "Mature adult"] = "Young adult"
    skin_tone: Literal[
        "Fair", "Light-medium", "Medium", "Deep", "Choose for me"
    ] = "Choose for me"
    outfit: Literal["Traditional", "Contemporary", "Formal"] = "Traditional"
    background: Literal[
        "Soft ivory", "Warm sand", "Midnight", "Luxury studio",
        "Wedding", "Festive", "Minimal", "Choose for me",
    ] = "Soft ivory"

    def for_generation(self) -> dict:
        if self.model_type == "Product only":
            return {
                "model_type": self.model_type,
                "background": self.background,
            }
        return self.model_dump()
