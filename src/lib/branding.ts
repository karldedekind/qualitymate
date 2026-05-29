import { getMany, KNOWN_KEYS } from "@/lib/settings";

export type Branding = {
  companyName: string;
  companyShortName: string;
  primaryColor: string;
  logoPath: string | null;
};

const DEFAULTS: Branding = {
  companyName: "QualityMate",
  companyShortName: "QM",
  primaryColor: "#1e40af",
  logoPath: null,
};

export async function getBranding(): Promise<Branding> {
  try {
    const values = await getMany([
      KNOWN_KEYS.COMPANY_NAME,
      KNOWN_KEYS.COMPANY_SHORT_NAME,
      KNOWN_KEYS.PRIMARY_COLOR,
      KNOWN_KEYS.LOGO_PATH,
    ]);
    return {
      companyName: values[KNOWN_KEYS.COMPANY_NAME] ?? DEFAULTS.companyName,
      companyShortName: values[KNOWN_KEYS.COMPANY_SHORT_NAME] ?? DEFAULTS.companyShortName,
      primaryColor: values[KNOWN_KEYS.PRIMARY_COLOR] ?? DEFAULTS.primaryColor,
      logoPath: values[KNOWN_KEYS.LOGO_PATH],
    };
  } catch {
    return DEFAULTS;
  }
}
