const React             = require('react');
const joinClasses       = require('classnames');
const cloneWithProps    = require('react/lib/cloneWithProps');
const EditorContainer   = require('./addons/editors/EditorContainer');
const ExcelColumn       = require('./addons/grids/ExcelColumn');
const isFunction        = require('./addons/utils/isFunction');
const CellMetaDataShape = require('./PropTypeShapes/CellMetaDataShape');
const SimpleCellFormatter = require('./addons/formatters/SimpleCellFormatter');

const Cell = React.createClass({

  propTypes: {
    rowIdx: React.PropTypes.number.isRequired,
    idx: React.PropTypes.number.isRequired,
    selected: React.PropTypes.shape({
      idx: React.PropTypes.number.isRequired
    }),
    selectedColumn: React.PropTypes.object,
    height: React.PropTypes.number,
    tabIndex: React.PropTypes.number,
    ref: React.PropTypes.string,
    column: React.PropTypes.shape(ExcelColumn).isRequired,
    value: React.PropTypes.oneOfType([React.PropTypes.string, React.PropTypes.number, React.PropTypes.object, React.PropTypes.bool]).isRequired,
    isExpanded: React.PropTypes.bool,
    isRowSelected: React.PropTypes.bool,
    cellMetaData: React.PropTypes.shape(CellMetaDataShape).isRequired,
    handleDragStart: React.PropTypes.func,
    className: React.PropTypes.string,
    cellControls: React.PropTypes.any,
    rowData: React.PropTypes.object.isRequired
  },

  getDefaultProps: function(): {tabIndex: number; ref: string; isExpanded: boolean } {
    return {
      tabIndex: -1,
      ref: 'cell',
      isExpanded: false
    };
  },

  getInitialState() {
    return {isRowChanging: false, isCellValueChanging: false};
  },

  componentDidMount: function() {
    this.checkFocus();
  },

  componentWillReceiveProps(nextProps) {
    this.setState({isRowChanging: this.props.rowData !== nextProps.rowData, isCellValueChanging: this.props.value !== nextProps.value});
  },

  componentDidUpdate: function() {
    this.checkFocus();
    let dragged = this.props.cellMetaData.dragged;
    if (dragged && dragged.complete === true) {
      this.props.cellMetaData.handleTerminateDrag();
    }
    if (this.state.isRowChanging && this.props.selectedColumn != null) {
      this.applyUpdateClass();
    }
  },

  shouldComponentUpdate(nextProps: any): boolean {
    return this.props.column.width !== nextProps.column.width
    || this.props.column.left !== nextProps.column.left
    || this.props.rowData !== nextProps.rowData
    || this.props.height !== nextProps.height
    || this.props.rowIdx !== nextProps.rowIdx
    || this.isCellSelectionChanging(nextProps)
    || this.isDraggedCellChanging(nextProps)
    || this.isCopyCellChanging(nextProps)
    || this.props.isRowSelected !== nextProps.isRowSelected
    || this.isSelected()
    || this.props.value !== nextProps.value;
  },

  onCellClick() {
    let meta = this.props.cellMetaData;
    if (meta != null && meta.onCellClick != null) {
      meta.onCellClick({rowIdx: this.props.rowIdx, idx: this.props.idx});
    }
  },

  onCellDoubleClick() {
    let meta = this.props.cellMetaData;
    if (meta != null && meta.onCellDoubleClick != null) {
      meta.onCellDoubleClick({rowIdx: this.props.rowIdx, idx: this.props.idx});
    }
  },

  getStyle(): {position:string; width: number; height: number; left: number} {
    let style = {
      position: 'absolute',
      width: this.props.column.width,
      height: this.props.height,
      left: this.props.column.left
    };
    return style;
  },

  getFormatter(): ?ReactElement {
    let col = this.props.column;
    if (this.isActive()) {
      return <EditorContainer rowData={this.getRowData()} rowIdx={this.props.rowIdx} idx={this.props.idx} cellMetaData={this.props.cellMetaData} column={col} height={this.props.height}/>;
    }

    return this.props.column.formatter;
  },

  getRowData() {
    return this.props.rowData.toJSON ? this.props.rowData.toJSON() : this.props.rowData;
  },

  getFormatterDependencies() {
    // convention based method to get corresponding Id or Name of any Name or Id property
    if (typeof this.props.column.getRowMetaData === 'function') {
      return this.props.column.getRowMetaData(this.getRowData(), this.props.column);
    }
  },

  getCellClass: function(): string {
    let className = joinClasses(
      this.props.column.cellClass,
      'react-grid-Cell',
      this.props.className,
      this.props.column.locked ? 'react-grid-Cell--locked' : null
    );
    let extraClasses = joinClasses({
      selected: this.isSelected() && !this.isActive(),
      editing: this.isActive(),
      copied: this.isCopied(),
      'active-drag-cell': this.isSelected() || this.isDraggedOver(),
      'is-dragged-over-up': this.isDraggedOverUpwards(),
      'is-dragged-over-down': this.isDraggedOverDownwards(),
      'was-dragged-over': this.wasDraggedOver()
    });
    return joinClasses(className, extraClasses);
  },

  getUpdateCellClass() {
    return this.props.column.getUpdateCellClass ? this.props.column.getUpdateCellClass(this.props.selectedColumn, this.props.column, this.state.isCellValueChanging) : '';
  },

  isColumnSelected() {
    let meta = this.props.cellMetaData;
    if (meta == null || meta.selected == null) { return false; }

    return (
      meta.selected
      && meta.selected.idx === this.props.idx
    );
  },

  isSelected: function(): boolean {
    let meta = this.props.cellMetaData;
    if (meta == null || meta.selected == null) { return false; }

    return (
      meta.selected
      && meta.selected.rowIdx === this.props.rowIdx
      && meta.selected.idx === this.props.idx
    );
  },

  isActive(): boolean {
    let meta = this.props.cellMetaData;
    if (meta == null || meta.selected == null) { return false; }
    return this.isSelected() && meta.selected.active === true;
  },

  isCellSelectionChanging(nextProps: {idx: number; cellMetaData: {selected: {idx: number}}}): boolean {
    let meta = this.props.cellMetaData;
    if (meta == null || meta.selected == null) { return false; }
    let nextSelected = nextProps.cellMetaData.selected;
    if (meta.selected && nextSelected) {
      return this.props.idx === nextSelected.idx || this.props.idx === meta.selected.idx;
    }

    return true;
  },

  applyUpdateClass() {
    let updateCellClass = this.getUpdateCellClass();
    // -> removing the class
    if (updateCellClass != null && updateCellClass !== '') {
      let cellDOMNode = this.getDOMNode();
      if (cellDOMNode.classList) {
        cellDOMNode.classList.remove(updateCellClass);
      // -> and re-adding the class
        cellDOMNode.classList.add(updateCellClass);
      } else if (cellDOMNode.className.indexOf(updateCellClass) === -1) {
        // IE9 doesn't support classList, nor (I think) altering element.className
        // without replacing it wholesale.
        cellDOMNode.className = cellDOMNode.className + ' ' + updateCellClass;
      }
    }
  },

  setScrollLeft(scrollLeft: number) {
    let ctrl: any = this; // flow on windows has an outdated react declaration, once that gets updated, we can remove this
    if (ctrl.isMounted()) {
      let node = React.findDOMNode(this);
      let transform = `translate3d(${scrollLeft}px, 0px, 0px)`;
      node.style.webkitTransform = transform;
      node.style.transform = transform;
    }
  },

  isCopied(): boolean {
    let copied = this.props.cellMetaData.copied;
    return (
      copied
      && copied.rowIdx === this.props.rowIdx
      && copied.idx === this.props.idx
    );
  },

  isDraggedOver(): boolean {
    let dragged = this.props.cellMetaData.dragged;
    return (
      dragged &&
      dragged.overRowIdx === this.props.rowIdx
      && dragged.idx === this.props.idx
    );
  },

  wasDraggedOver(): boolean {
    let dragged = this.props.cellMetaData.dragged;
    return (
      dragged
      && ((dragged.overRowIdx < this.props.rowIdx && this.props.rowIdx < dragged.rowIdx)
      ||  (dragged.overRowIdx > this.props.rowIdx && this.props.rowIdx > dragged.rowIdx))
      && dragged.idx === this.props.idx
    );
  },

  isDraggedCellChanging(nextProps: any): boolean {
    let isChanging;
    let dragged = this.props.cellMetaData.dragged;
    let nextDragged = nextProps.cellMetaData.dragged;
    if (dragged) {
      isChanging = (nextDragged && this.props.idx === nextDragged.idx)
      || (dragged && this.props.idx === dragged.idx);
      return isChanging;
    }

    return false;
  },

  isCopyCellChanging(nextProps: any): boolean {
    let isChanging;
    let copied = this.props.cellMetaData.copied;
    let nextCopied = nextProps.cellMetaData.copied;
    if (copied) {
      isChanging = ( nextCopied && this.props.idx ===  nextCopied.idx)
      || (copied && this.props.idx === copied.idx);
      return isChanging;
    }
    return false;
  },

  isDraggedOverUpwards(): boolean {
    let dragged = this.props.cellMetaData.dragged;
    return !this.isSelected() && this.isDraggedOver() && this.props.rowIdx < dragged.rowIdx;
  },

  isDraggedOverDownwards(): boolean {
    let dragged = this.props.cellMetaData.dragged;
    return !this.isSelected() && this.isDraggedOver() && this.props.rowIdx > dragged.rowIdx;
  },

  checkFocus: function() {
    if (this.isSelected() && !this.isActive()) {
      React.findDOMNode(this).focus();
    }
  },

  renderCellContent(props: any): ReactElement {
    let CellContent;
    let Formatter = this.getFormatter();
    if (React.isValidElement(Formatter)) {
      props.dependentValues = this.getFormatterDependencies();
      CellContent = cloneWithProps(Formatter, props);
    } else if (isFunction(Formatter)) {
      CellContent = <Formatter value={this.props.value} dependentValues={this.getFormatterDependencies()}/>;
    } else {
      CellContent = <SimpleCellFormatter value={this.props.value}/>;
    }
    return (<div ref="cell"
      className="react-grid-Cell__value">{CellContent} {this.props.cellControls}</div>);
  },

  render(): ?ReactElement {
    let style = this.getStyle();

    let className = this.getCellClass();

    let cellContent = this.renderCellContent({
      value: this.props.value,
      column: this.props.column,
      rowIdx: this.props.rowIdx,
      isExpanded: this.props.isExpanded
    });

    return (
      <div {...this.props} className={className} style={style} onClick={this.onCellClick} onDoubleClick={this.onCellDoubleClick} >
      {cellContent}
      <div className="drag-handle" draggable="true">
      </div>
      </div>
    );
  }
});

module.exports = Cell;
