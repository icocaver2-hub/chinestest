export interface StandaloneError {
  instancePath: string;
  schemaPath: string;
  keyword: string;
  params: Record<string, unknown>;
  message?: string;
}
interface StandaloneValidate {
  (data: unknown): boolean;
  errors: StandaloneError[] | null;
}
declare const validate: StandaloneValidate;
export { validate };
export default validate;
