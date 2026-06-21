export type FormFieldType =
  | "text"
  | "number"
  | "textarea"
  | "select"
  | "radio"
  | "checkbox"
  | "date"
  | "datetime"
  | "file";

export interface FormFieldDefinition {
  id: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  help_text?: string | null;
  options?: string[];
}

export interface FormTemplate {
  id: string;
  name: string;
  title: string;
  intro?: string | null;
  fields: FormFieldDefinition[];
  created_at: string;
  updated_at: string;
}

export interface FormTemplateCreateInput {
  name: string;
  title: string;
  intro?: string | null;
  fields: FormFieldDefinition[];
}

export interface FormTemplateUpdateInput {
  name?: string;
  title?: string;
  intro?: string | null;
  fields?: FormFieldDefinition[];
}

export const FORM_FIELD_TYPES: FormFieldType[] = [
  "text",
  "number",
  "textarea",
  "select",
  "radio",
  "checkbox",
  "date",
  "datetime",
  "file",
];

export function newFormField(type: FormFieldType): FormFieldDefinition {
  return {
    id: `field_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    label: `New ${type.charAt(0).toUpperCase()}${type.slice(1)}`,
    type,
    required: false,
    help_text: "",
    options: [],
  };
}

export function fieldTypeHasOptions(type: FormFieldType): boolean {
  return type === "select" || type === "radio" || type === "checkbox";
}
