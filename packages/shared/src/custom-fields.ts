import { z } from "zod";

export const CUSTOM_FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "date",
  "dropdown",
  "multi_select",
  "user",
  "checkbox",
  "url",
  "email",
  "phone",
] as const;

export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export interface CustomFieldOption {
  id: string;
  label: string;
  color?: string;
}

export interface CustomFieldDefinitionLike {
  id: string;
  key: string;
  label: string;
  type: CustomFieldType;
  options?: CustomFieldOption[] | null;
  isRequired: boolean;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

/** Zod schema for a single custom field value, derived from its definition. */
export function valueSchemaFor(def: CustomFieldDefinitionLike): z.ZodTypeAny {
  let schema: z.ZodTypeAny;
  switch (def.type) {
    case "text":
    case "textarea":
      schema = z.string().max(def.type === "text" ? 500 : 10_000);
      break;
    case "number":
      schema = z.number().finite();
      break;
    case "date":
      schema = isoDate;
      break;
    case "dropdown": {
      const ids = (def.options ?? []).map((o) => o.id);
      schema = ids.length > 0 ? z.enum(ids as [string, ...string[]]) : z.never();
      break;
    }
    case "multi_select": {
      const ids = (def.options ?? []).map((o) => o.id);
      schema =
        ids.length > 0 ? z.array(z.enum(ids as [string, ...string[]])).max(ids.length) : z.never();
      break;
    }
    case "user":
      schema = z.string().uuid();
      break;
    case "checkbox":
      schema = z.boolean();
      break;
    case "url":
      schema = z.string().url().max(2000);
      break;
    case "email":
      schema = z.string().email().max(320);
      break;
    case "phone":
      schema = z.string().min(3).max(30);
      break;
  }
  return def.isRequired ? schema : schema.nullish();
}

/**
 * Zod schema validating a full `custom_fields` JSONB object
 * (`{ [definitionId]: value }`) against a list's definitions.
 * Unknown keys are rejected.
 */
export function customFieldsSchemaFor(defs: CustomFieldDefinitionLike[]): z.ZodTypeAny {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const def of defs) {
    shape[def.id] = def.isRequired ? valueSchemaFor(def) : valueSchemaFor(def).optional();
  }
  return z.object(shape).strict();
}
