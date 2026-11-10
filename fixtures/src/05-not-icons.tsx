// @ts-nocheck
import { Button } from '@mui/material';
import { Panel } from './components/Panel';

export function NotIcons() {
  return (
    <div className="box">
      <Button variant="contained">Save</Button>
      <Panel title="Hover me: no IconPeek hover expected" />
      <span>plain text</span>
    </div>
  );
}
