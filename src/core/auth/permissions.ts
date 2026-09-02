import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";

export const ac = createAccessControl(defaultStatements);

export const adminRoles = {
  ADMIN: ac.newRole({
    user: [...defaultStatements.user],
    session: [...defaultStatements.session],
  }),
  STUDENT: ac.newRole({ user: [], session: [] }),
  PARENT: ac.newRole({ user: [], session: [] }),
};
