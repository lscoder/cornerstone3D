import type { AABB } from '../types/AABB';
import type { Point2 } from '../types/Point2';
import { getPointAABBDistanceSquared } from './getPointAABBDistanceSquared';

export function getPointAABBDistance(aabb: AABB, point: Point2): number {
  return Math.sqrt(getPointAABBDistanceSquared(aabb, point));
}
