import { Popover, type PopoverProps } from '../components/Popover';

export function DocumentPopover(
  props: Omit<
    PopoverProps,
    'anchorClassName' | 'triggerClassName' | 'panelClassName'
  >,
) {
  return (
    <Popover
      {...props}
      anchorClassName="documents-popover-anchor"
      triggerClassName="documents-control"
      panelClassName="documents-popover"
    />
  );
}
