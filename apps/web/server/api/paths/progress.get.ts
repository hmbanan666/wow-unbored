import { pathEvent } from "../../utils/path-event";
export default defineEventHandler((event) => pathEvent(event, "GET"));
