"use client";

import { closestCenter, DndContext, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useState, useTransition } from "react";

/**
 * Liste réordonnable au glisser-déposer (souris, doigt sur tablette, clavier :
 * Espace pour saisir, flèches pour déplacer). L'ordre est enregistré automatiquement.
 */
export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  render,
  disabled,
}: {
  items: T[];
  onReorder: (ids: string[]) => Promise<void>;
  render: (item: T, handle: React.ReactNode) => React.ReactNode;
  disabled?: boolean;
}) {
  const [list, setList] = useState(items);
  const [saving, start] = useTransition();
  useEffect(() => setList(items), [items]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = list.findIndex((x) => x.id === e.active.id);
    const to = list.findIndex((x) => x.id === e.over!.id);
    const next = arrayMove(list, from, to);
    setList(next);
    start(() => onReorder(next.map((x) => x.id)));
  };
  if (disabled) return <ul className="space-y-2">{list.map((item) => <li key={item.id}>{render(item, null)}</li>)}</ul>;
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={list.map((x) => x.id)} strategy={verticalListSortingStrategy}>
        <ul className={`space-y-2 ${saving ? "opacity-70" : ""}`}>
          {list.map((item) => <SortableRow key={item.id} id={item.id}>{(handle) => render(item, handle)}</SortableRow>)}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({ id, children }: { id: string; children: (handle: React.ReactNode) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const handle = (
    <button type="button" {...attributes} {...listeners} aria-label="Déplacer (glisser)"
      className="flex h-11 w-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-xl text-neutral-400 hover:bg-neutral-100 active:cursor-grabbing">
      ⠿
    </button>
  );
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={isDragging ? "relative z-10 shadow-2xl" : ""}>
      {children(handle)}
    </li>
  );
}
