import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
		<s-link href="/app">Image manager</s-link>
		<s-link href="/app/seo">SEO workspace</s-link>
		<s-link href="/app/automation">Automation</s-link>
		<s-link href="/app/optimize">Image optimizer</s-link>
		<s-link href="/app/technical">Technical SEO</s-link>
		<s-link href="/app/tracking">Tracking Intelligence</s-link>
		<s-link href="/app/tracking/orders">Order sources</s-link>
		<s-link href="/app/tracking/integrations">Integrations</s-link>
		<s-link href="/app/settings">AI settings</s-link>
		<s-link href="/app/tracking/ga4">GA4 Events</s-link>
		<s-link href="/app/tracking/ads">Ads Conversions</s-link>
		<s-link href="/app/tracking/duplicates">Duplicates</s-link>
		<s-link href="/app/tracking/gtm">GTM Inspector</s-link>
		<s-link href="/app/tracking/linker">Conversion Linker</s-link>
		<s-link href="/app/tracking/enhanced">Enhanced Conversions</s-link>
		<s-link href="/app/tracking/reconciliation">Revenue Reconciliation</s-link>
		<s-link href="/app/tracking/transaction-ids">Transaction IDs</s-link>
		<s-link href="/app/tracking/test-lab">Test Lab</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);