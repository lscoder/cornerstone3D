import { WidgetProps } from '../../Widget';
import { ColorBarOrientation } from '../enums/ColorBarOrientation';
import { ColorBarRange } from './ColorBarRange';
import { ColorBarVOIRange } from './ColorBarVOIRange';
import { Colormap } from './Colormap';

export interface ColorBarProps extends WidgetProps {
  colormaps: Colormap[];
  activeColormapName?: string;
  range?: ColorBarRange;
  voiRange?: ColorBarVOIRange;
  orientation?: ColorBarOrientation;
}
