import { AABB } from '../types/AABB';

/**
 * Returns a copy of the AABB grown a given number of units towards all the sides.
 * @param aabb - Axis-aligned bounding box
 * @param amount - Amount (in pixels) to push each AABB's side
 */
export function grow(aabb: AABB, amount: number): AABB {
  return {
    minX: aabb.minX - amount,
    minY: aabb.minY - amount,
    maxX: aabb.maxX + amount,
    maxY: aabb.maxY + amount,
  };
}
