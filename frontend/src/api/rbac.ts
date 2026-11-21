import { endpoints } from "@enterprise/contracts";
import { endpoint } from "./endpoint";

export const rbacApi = {
  context: endpoint(endpoints.Rbac_context),
  members: endpoint(endpoints.Rbac_members),
  member: endpoint(endpoints.Rbac_member),
  saveMember: endpoint(endpoints.Rbac_saveMember),
  setMemberStatus: endpoint(endpoints.Rbac_setMemberStatus),
  removeMember: endpoint(endpoints.Rbac_removeMember),
  operationLogs: endpoint(endpoints.Rbac_operationLogs),
};
