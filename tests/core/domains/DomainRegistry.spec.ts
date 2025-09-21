import { describe, it, expect } from 'vitest';
import { DomainRegistry } from '../../../src/core/domains/DomainRegistry.js';

describe('DomainRegistry', () => {
  it('should store definition when registering a domain', () => {
    // Arrange
    const registry = new DomainRegistry();
    const definition = { name: 'billing', defaultImpact: 'reliability' } as const;

    // Act
    registry.register(definition);

    // Assert
    expect(registry.get('billing')).toEqual(definition);
    expect(registry.has('billing')).toBe(true);
  });

  it('should override definition when registering the same domain twice', () => {
    // Arrange
    const registry = new DomainRegistry();
    registry.register({ name: 'support', defaultImpact: 'none' });
    const updated = { name: 'support', defaultImpact: 'performance' } as const;

    // Act
    registry.register(updated);

    // Assert
    expect(registry.get('support')).toEqual(updated);
  });

  it('should register multiple definitions when calling registerMany', () => {
    // Arrange
    const registry = new DomainRegistry();
    const definitions = [
      { name: 'checkout', defaultImpact: 'revenue' },
      { name: 'profile', defaultImpact: 'engagement' },
    ] as const;

    // Act
    registry.registerMany(definitions);

    // Assert
    expect(registry.list()).toEqual(definitions);
  });

  it('should return empty array when listing without registrations', () => {
    // Arrange
    const registry = new DomainRegistry();

    // Act
    const domains = registry.list();

    // Assert
    expect(domains).toEqual([]);
  });

  it('should return undefined when retrieving missing definition', () => {
    // Arrange
    const registry = new DomainRegistry();

    // Act
    const definition = registry.get('unknown');

    // Assert
    expect(definition).toBeUndefined();
    expect(registry.has('unknown')).toBe(false);
  });
});
