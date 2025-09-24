import type { Domain, DomainDefinition } from "../../types/index.js";

/**
 * Maintains metadata describing application domains and their defaults.
 */
export class DomainRegistry {
  private readonly domains = new Map<Domain, DomainDefinition>();

  /**
   * Registers or updates a single domain definition.
   * @param {DomainDefinition} definition - Domain metadata to store.
   * @returns {void}
   */
  register(definition: DomainDefinition): void {
    this.domains.set(definition.name, definition);
  }

  /**
   * Registers multiple domain definitions in bulk.
   * @param {DomainDefinition[]} definitions - Collection of domains to register.
   * @returns {void}
   */
  registerMany(definitions: DomainDefinition[]): void {
    for (const definition of definitions) this.register(definition);
  }

  /**
   * Fetches a domain definition by name, if present.
   * @param {Domain} name - Domain identifier to look up.
   * @returns {DomainDefinition | undefined} Matching definition or undefined when unknown.
   */
  get(name: Domain): DomainDefinition | undefined {
    return this.domains.get(name);
  }

  /**
   * Checks whether a domain definition exists.
   * @param {Domain} name - Domain identifier to inspect.
   * @returns {boolean} True when the domain is registered.
   */
  has(name: Domain): boolean {
    return this.domains.has(name);
  }

  /**
   * Lists all registered domain definitions.
   * @returns {DomainDefinition[]} Collection of domain metadata objects.
   */
  list(): DomainDefinition[] {
    return [...this.domains.values()];
  }
}
