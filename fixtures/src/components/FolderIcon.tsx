// @ts-nocheck
// A folder of svgs named after the prop: the path template reveals the folder.
export default function FolderIcon({ name }) {
  return <img src={new URL(`../assets/icons/${name}.svg`, import.meta.url).href} alt="" />;
}
