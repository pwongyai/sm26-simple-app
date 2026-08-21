"use client";

// The shape every page with "some fixed stuff, then a list of cards" should
// use — extracted from the Booking tab after getting this wrong twice:
//
// 1. `position: sticky` on the header, still living inside the one scroll
//    container, looked right but visibly wiggled during mobile Safari's
//    rubber-band overscroll bounce at either end of the scroll.
// 2. The fix is a true sibling split: the header is a plain, non-scrolling
//    block, and the list gets its OWN nested scroll box that exactly fills
//    whatever height is left. `min-h-0` on both this root and the list is
//    required — flex children default to a min-height that fits their
//    content, which silently defeats `overflow-y-auto` (the box just grows
//    instead of scrolling) unless explicitly overridden.
// 3. `h-full` makes this fill the surrounding page's own scroll container
//    (contractor/farmer layout's `<main>`) exactly, so `main` itself never
//    has anything to scroll — only the list here does. Don't add height
//    classes at the call site; this component already fills its parent.
// 4. The gap between the header and the first card belongs on the list
//    (`pt-3` here), not as bottom padding on the header. Padding on the
//    header is permanent — it never goes away. Padding on the list scrolls
//    away with everything else, so the first card can reach all the way up
//    to the header once scrolled, matching version 3's own behavior.
//
// Usage:
//   <FrozenHeaderScroll header={<><Tabs /><SearchBar /></>}>
//     {items.map((i) => <Card key={i.id} {...i} />)}
//   </FrozenHeaderScroll>
export default function FrozenHeaderScroll({ header, children }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0">{header}</div>
      <div className="min-h-0 flex-1 overflow-y-auto pt-3">{children}</div>
    </div>
  );
}
