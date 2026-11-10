// @ts-nocheck
// switch/case: `case 'name'` -> an imported svg component, or an inline <svg>.
import BellSvg from '../assets/icons/bell.svg?react';
import HomeSvg from '../assets/icons/home.svg?react';

export function SwitchIcon({ name }) {
  switch (name) {
    case 'home':
      return <HomeSvg />;
    case 'bell':
      return <BellSvg />;
    case 'flash':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      );
    default:
      return null;
  }
}
