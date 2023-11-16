import type { Point2 } from '../../math/types/Point2';
import type { AABB } from '../../math/types/AABB';
import type { SplineCurveSegment } from './SplineCurveSegment';
import type { ClosestPoint } from './ClosestPoint';
import type { ClosestControlPoint } from './ClosestControlPoint';
import type { ClosestSplinePoint } from './ClosestSplinePoint';

export interface ISpline {
  get numControlPoints(): number;
  get resolution(): number;
  set resolution(resolution: number);
  get closed(): boolean;
  set closed(closed: boolean);
  get curveSegments(): SplineCurveSegment[];
  get aabb(): AABB;
  get length(): number;
  get invalidated(): boolean;
  addControlPoint(x: number, y: number): void;
  addControlPointAt(u: number): void;
  addControlPoints(points: Point2[]): void;
  deleteControlPointAt(index: number): boolean;
  clearControlPoints(): void;
  setControlPoints(points: Point2[]): void;
  updateControlPoint(index: number, x: number, y: number): void;
  getControlPoints(): Point2[];
  getClosestControlPoint(point: Point2): ClosestControlPoint;
  getClosestPoint(point: Point2): ClosestSplinePoint;
  getClosestControlPointWithinRange(
    point: Point2,
    range: number
  ): ClosestControlPoint;
  getClosestControlPointLinesPoint(point: Point2): ClosestPoint;
  getPolylinePoints(): Point2[];
  isPointNearCurve(point: Point2, maxDist: number): boolean;
  containsPoint(point: Point2): boolean;
}
