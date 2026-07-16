import type { AppNavigationItem } from "./navigation-items";

export function NavIcon({ icon }: { icon: AppNavigationItem["icon"] }) {
  if (icon === "home") {
    return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 10.8 12 4l8 6.8V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1v-9.2Z" /></svg>;
  }

  if (icon === "inventory") {
    return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 5.5A2.5 2.5 0 0 1 7.5 3h9A2.5 2.5 0 0 1 19 5.5V20a1 1 0 0 1-1.4.9L15 19.7l-2.6 1.2a1 1 0 0 1-.8 0L9 19.7l-2.6 1.2A1 1 0 0 1 5 20V5.5Zm4 2V9h6V7.5H9Zm0 4V13h6v-1.5H9Z" /></svg>;
  }

  if (icon === "macros") {
    return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 19V5h3v14H5Zm5.5 0V9h3v10h-3Zm5.5 0v-6h3v6h-3Z" /></svg>;
  }

  if (icon === "diet") {
    return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 4c4.6 0 7.4 3.1 7.8 7.5-4.3.4-7.5-1.2-9.8-4.4C7.7 8.5 6.2 11 6.2 15c0 2.3 1.7 4 4 4 3.6 0 5.9-2.1 7-5.7l2 .7c-1.4 4.4-4.4 7-9 7A6.1 6.1 0 0 1 4 15c0-6.5 3.2-11 8-11Z" /></svg>;
  }

  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M10.9 3h2.2l.5 2.3c.6.2 1.1.4 1.6.7l2-1.2 1.6 1.6-1.2 2c.3.5.5 1 .7 1.6l2.3.5v2.2l-2.3.5c-.2.6-.4 1.1-.7 1.6l1.2 2-1.6 1.6-2-1.2c-.5.3-1 .5-1.6.7l-.5 2.3h-2.2l-.5-2.3c-.6-.2-1.1-.4-1.6-.7l-2 1.2-1.6-1.6 1.2-2c-.3-.5-.5-1-.7-1.6L3.4 13v-2.2l2.3-.5c.2-.6.4-1.1.7-1.6l-1.2-2 1.6-1.6 2 1.2c.5-.3 1-.5 1.6-.7L10.9 3Zm1.1 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" /></svg>;
}
