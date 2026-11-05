import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Veyro: AI product image &amp; ALT manager</h1>
        <p className={styles.text}>
          Give your Shopify product images clear, useful descriptions. Analyze colors, edit ALT text, and publish with confidence.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Understand image colors.</strong> Compare AI-detected colors with your product options.
          </li>
          <li>
            <strong>Make ALT text your own.</strong> Generate descriptions with your template and edit each suggestion.
          </li>
          <li>
            <strong>Stay in control.</strong> Review every suggestion before approving changes to Shopify.
          </li>
        </ul>
      </div>
    </div>
  );
}

