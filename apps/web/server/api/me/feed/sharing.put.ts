import { feedOwnerRequest } from "../../../utils/feed-owner";
export default defineEventHandler((event) => feedOwnerRequest(event, "sharing"));
