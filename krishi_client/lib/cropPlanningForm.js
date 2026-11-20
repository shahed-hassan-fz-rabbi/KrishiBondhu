/** Validates farmer-entered fields and builds the existing crop-planning API contract. */
export function validateCropPlanningForm(formData, availableUpazilas) {
  if (!formData.districtCode) return "districtRequired";
  if (!formData.upazila) return "upazilaRequired";
  if (!availableUpazilas.some((item) => item.nameEn === formData.upazila)) return "invalidUpazila";

  const area = Number(formData.area);
  if (!Number.isFinite(area) || area <= 0) return "areaRequired";

  if (formData.targetPlantingPeriod) {
    const target = new Date(`${formData.targetPlantingPeriod}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(formData.targetPlantingPeriod) || Number.isNaN(target.getTime()) || target.toISOString().slice(0, 10) !== formData.targetPlantingPeriod) return "invalidPlantingDate";
  }

  return null;
}

export function buildCropPlanningPayload(formData, language, farmId = null) {
  return {
    ...(farmId ? { farmId } : {}),
    districtCode: formData.districtCode,
    upazila: formData.upazila,
    village: formData.village.trim(),
    land: {
      area: Number(formData.area),
      unit: formData.unit,
      landType: formData.landType,
      soilType: formData.soilType,
      drainage: formData.drainage,
    },
    water: {
      irrigationAvailability: formData.irrigationAvailability,
      waterSource: formData.waterSource,
    },
    preferences: {
      seasonPreference: formData.seasonPreference || null,
      preferredCrop: formData.preferredCrop || null,
      targetPlantingPeriod: formData.targetPlantingPeriod || null,
    },
    language: language === "bn" ? "bn" : "en",
  };
}

export function getCropPlanningErrorMessage(response, translate) {
  if (["NETWORK_ERROR", "REQUEST_TIMEOUT"].includes(response?.error?.code)) {
    return translate("myFarm.planning.networkError");
  }
  if (response?.status === 401) return translate("myFarm.planning.unauthorized");
  if (response?.status >= 500) return translate("myFarm.planning.serverError");
  return response?.error?.message || translate("myFarm.planning.evaluationFailed");
}
