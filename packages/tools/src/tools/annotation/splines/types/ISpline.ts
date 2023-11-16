import type { Point2 } from './Point2';
import type { AABB } from './AABB';
import type { SplineCurveSegment } from './SplineCurveSegment';
import type { ClosestControlPoint } from './ClosestControlPoint';

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
  addControlPoints(points: Point2[]): void;
  clearControlPoints(): void;
  setControlPoints(points: Point2[]): void;
  updateControlPoint(index: number, x: number, y: number): void;
  getControlPoints(): Point2[];
  getClosestControlPoint(x: number, y: number): ClosestControlPoint;
  getClosestControlPointWithinRange(
    x: number,
    y: number,
    range: number
  ): ClosestControlPoint;
  getPolylinePoints(): Point2[];
  isPointNearCurve(point: Point2, maxDist: number): boolean;
  containsPoint(x: number, y: number): boolean;
}
