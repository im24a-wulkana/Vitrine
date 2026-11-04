import { join } from "node:path";

export const LOCAL_USER_ID = "00000000-0000-4000-8000-000000000001";
export const LOCAL_DATA_DIR = join(process.cwd(), ".vitrine-data");
export const LOCAL_UPLOAD_DIR = join(LOCAL_DATA_DIR, "uploads");
