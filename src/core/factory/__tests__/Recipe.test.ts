import { describe, it, expect } from 'vitest';
import { RECIPES, getRecipeForFood } from '../Recipe';

describe('Recipe', () => {
  describe('RECIPES', () => {
    it('should contain 3 default recipes', () => {
      expect(RECIPES.length).toBe(3);
    });

    it('should have valid recipe IDs', () => {
      const ids = RECIPES.map(r => r.id);
      expect(ids).toContain('bake_bread');
      expect(ids).toContain('cook_meat');
      expect(ids).toContain('bake_cake');
    });

    it('should have positive duration for all recipes', () => {
      for (const recipe of RECIPES) {
        expect(recipe.duration).toBeGreaterThan(0);
      }
    });

    it('should have at least one input and one output per recipe', () => {
      for (const recipe of RECIPES) {
        expect(recipe.inputs.length).toBeGreaterThan(0);
        expect(recipe.outputs.length).toBeGreaterThan(0);
      }
    });

    it('should have positive counts for all inputs and outputs', () => {
      for (const recipe of RECIPES) {
        for (const input of recipe.inputs) {
          expect(input.count).toBeGreaterThan(0);
        }
        for (const output of recipe.outputs) {
          expect(output.count).toBeGreaterThan(0);
        }
      }
    });

    it('bread recipe needs wheat and water', () => {
      const bread = RECIPES.find(r => r.id === 'bake_bread')!;
      const inputTypes = bread.inputs.map(i => i.type);
      expect(inputTypes).toContain('wheat');
      expect(inputTypes).toContain('water');
    });

    it('meat recipe needs raw meat', () => {
      const meat = RECIPES.find(r => r.id === 'cook_meat')!;
      expect(meat.inputs[0].type).toBe('meat_raw');
    });

    it('cake recipe needs wheat and sugar', () => {
      const cake = RECIPES.find(r => r.id === 'bake_cake')!;
      const inputTypes = cake.inputs.map(i => i.type);
      expect(inputTypes).toContain('wheat');
      expect(inputTypes).toContain('sugar');
    });
  });

  describe('getRecipeForFood', () => {
    it('should find bread recipe by food id', () => {
      const recipe = getRecipeForFood('bread');
      expect(recipe).toBeDefined();
      expect(recipe!.id).toBe('bake_bread');
    });

    it('should find meat recipe by food id', () => {
      const recipe = getRecipeForFood('meat');
      expect(recipe).toBeDefined();
      expect(recipe!.id).toBe('cook_meat');
    });

    it('should find cake recipe by food id', () => {
      const recipe = getRecipeForFood('cake');
      expect(recipe).toBeDefined();
      expect(recipe!.id).toBe('bake_cake');
    });

    it('should return undefined for non-food id', () => {
      const recipe = getRecipeForFood('wheat');
      expect(recipe).toBeUndefined();
    });

    it('should return undefined for nonexistent food', () => {
      const recipe = getRecipeForFood('pizza');
      expect(recipe).toBeUndefined();
    });
  });
});
