import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";

interface TabItemProps {
  label: string;
  children: ReactNode;
}

interface TabsProps {
  syncKey?: string;
  children: ReactNode;
}

const TAB_EVENT = "sheetwrite:docs-tab";

export function TabItem({ children }: Readonly<TabItemProps>) {
  return children;
}

export function Tabs({ children, syncKey }: Readonly<TabsProps>) {
  const tabs = useMemo(
    () =>
      Children.toArray(children).filter(
        (child): child is ReactElement<TabItemProps> =>
          isValidElement<TabItemProps>(child) && typeof child.props.label === "string",
      ),
    [children],
  );
  const [selected, setSelected] = useState(0);
  const id = useId();

  useEffect(() => {
    if (syncKey === undefined) return;
    const stored = window.localStorage.getItem(syncKey);
    const index = tabs.findIndex((tab) => tab.props.label === stored);
    if (index >= 0) setSelected(index);

    const onChange = (event: Event) => {
      if (!(event instanceof CustomEvent) || event.detail?.key !== syncKey) return;
      const next = tabs.findIndex((tab) => tab.props.label === event.detail.label);
      if (next >= 0) setSelected(next);
    };
    window.addEventListener(TAB_EVENT, onChange);
    return () => window.removeEventListener(TAB_EVENT, onChange);
  }, [syncKey, tabs]);

  const select = (index: number) => {
    setSelected(index);
    if (syncKey === undefined) return;
    const label = tabs[index]?.props.label;
    if (label === undefined) return;
    window.localStorage.setItem(syncKey, label);
    window.dispatchEvent(new CustomEvent(TAB_EVENT, { detail: { key: syncKey, label } }));
  };

  const active = tabs[selected] ?? tabs[0];
  if (active === undefined) return null;

  return (
    <div className="sw-tabs">
      <div className="sw-tabs__list" role="tablist" aria-label="Framework">
        {tabs.map((tab, index) => (
          <button
            aria-controls={`${id}-panel-${index}`}
            aria-selected={index === selected}
            id={`${id}-tab-${index}`}
            key={tab.props.label}
            onClick={() => select(index)}
            role="tab"
            type="button"
          >
            {tab.props.label}
          </button>
        ))}
      </div>
      <div
        aria-labelledby={`${id}-tab-${selected}`}
        className="sw-tabs__panel"
        id={`${id}-panel-${selected}`}
        role="tabpanel"
      >
        {active.props.children}
      </div>
    </div>
  );
}
