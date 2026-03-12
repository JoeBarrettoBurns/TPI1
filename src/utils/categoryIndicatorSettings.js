export const DEFAULT_CATEGORY_INDICATOR_SETTINGS = Object.freeze({
    low: 5,
    high: 10,
});

const toFiniteNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const hasExplicitIndicatorSettings = (settings) => (
    settings && (
        Object.prototype.hasOwnProperty.call(settings, 'low') ||
        Object.prototype.hasOwnProperty.call(settings, 'high') ||
        Object.prototype.hasOwnProperty.call(settings, 'visualLowThreshold') ||
        Object.prototype.hasOwnProperty.call(settings, 'visualHighThreshold')
    )
);

export const normalizeCategoryIndicatorSettings = (settings) => {
    const fallbackLow = DEFAULT_CATEGORY_INDICATOR_SETTINGS.low;
    const fallbackHigh = DEFAULT_CATEGORY_INDICATOR_SETTINGS.high;

    const parsedLow = toFiniteNumber(settings?.low ?? settings?.visualLowThreshold);
    const parsedHigh = toFiniteNumber(settings?.high ?? settings?.visualHighThreshold);

    const low = parsedLow !== null && parsedLow >= 0 ? parsedLow : fallbackLow;
    let high = parsedHigh !== null && parsedHigh > low ? parsedHigh : fallbackHigh;

    if (high <= low) {
        high = low + 1;
    }

    return { low, high };
};

export const buildMaterialIndicatorSettingsMap = (materials) => {
    const settingsByMaterial = {};

    Object.entries(materials || {}).forEach(([materialName, material]) => {
        settingsByMaterial[materialName] = hasExplicitIndicatorSettings(material)
            ? normalizeCategoryIndicatorSettings(material)
            : { ...DEFAULT_CATEGORY_INDICATOR_SETTINGS };
    });

    return settingsByMaterial;
};
