class ColorBarDisplay {
  constructor() {
    //
  }

  private _createElement() {
    const rootElement = document.createElement('div');
    const width = 200;

    Object.assign(rootElement.style, {
      position: 'absolute',
      width: `${200}px`,
      height: '248px', // colorBar height,
      left: `-${width}px`,
      backgroundColor: 'rgba(255, 0, 0, 0.2)',
    });
  }
}

export { ColorBarDisplay as default, ColorBarDisplay };
