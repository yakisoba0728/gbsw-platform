export type CommunityFormValues = {
  slug: string;
  name: string;
  description: string;
  readRoles: string[];
  writeRoles: string[];
  anonymous: boolean;
  allowAttachments: boolean;
  sortOrder: string;
};

export type CommunityFormState = {
  ok: boolean;
  error: string | null;
  values?: CommunityFormValues;
};

export const EMPTY_COMMUNITY_FORM_STATE: CommunityFormState = {
  ok: false,
  error: null,
};
