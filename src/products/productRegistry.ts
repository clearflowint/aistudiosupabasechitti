// MIX: This is the composition point where product modules are registered.
import { cfcfProduct } from "../features/cfcf/product";
import type { ProductDefinition } from "../core/products/product.types";

const registeredProducts: readonly ProductDefinition[] = [
  cfcfProduct,
];

function selectActiveProduct(): ProductDefinition {
  const configuredProductId = import.meta.env.VITE_DEFAULT_PRODUCT_ID?.trim();
  const product = configuredProductId
    ? registeredProducts.find(({ id }) => id === configuredProductId)
    : registeredProducts.length === 1
      ? registeredProducts[0]
      : undefined;

  if (!product) {
    throw new Error(
      configuredProductId
        ? "VITE_DEFAULT_PRODUCT_ID does not match a registered product."
        : "Set VITE_DEFAULT_PRODUCT_ID when more than one product is registered.",
    );
  }

  const homePages = product.navigation.filter(({ isHome }) => isHome);
  const pageIds = product.navigation.map(({ id }) => id);
  if (homePages.length !== 1) {
    throw new Error("Each product must register exactly one home navigation item.");
  }
  if (new Set(pageIds).size !== pageIds.length) {
    throw new Error("A product cannot register duplicate navigation IDs.");
  }

  return product;
}

export const activeProduct = selectActiveProduct();
