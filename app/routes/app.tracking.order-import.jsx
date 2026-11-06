import { authenticate } from "../shopify.server";
import { advanceOrderImport } from "../services/order-import.server";

// Polled by the Order sources page while an import runs. Each call moves the import forward.
export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  try {
    return { import: await advanceOrderImport({ admin, shop: session.shop }) };
  } catch (error) {
    return { error: `Couldn't check the import: ${error.message}` };
  }
};
