import { Fragment, type ReactNode } from "react";
import { View } from "react-native";
import { EarlierYears, type useEarlierYears } from "@/components/EarlierYears";
import {
  type AppIconName,
  EmptyState,
  FadeInView,
  LoadingState,
  ReadableColumn,
  SectionTitle,
  stagger,
} from "@/components/ui";
import { spacing } from "@/theme";

export type StatusGroup<Status> = { title: string; statuses: Status[] };

type ListRow<Status> = { _id: string; status: Status };

export const GroupedList = <Status, Row extends ListRow<Status>>({
  rows,
  groups,
  icon,
  empty,
  header,
  footer,
  renderRow,
}: {
  rows: Row[] | null | undefined;
  groups: StatusGroup<Status>[];
  icon: AppIconName;
  empty: { title: string; message: string; action?: { label: string; onPress: () => void } };
  header?: ReactNode;
  footer?: ReactNode;
  renderRow: (row: Row) => ReactNode;
}) => {
  let index = 0;
  return (
    <ReadableColumn>
      <View style={{ gap: spacing.sm }}>
        {header}
        {rows === undefined ? <LoadingState /> : null}
        {rows !== undefined && (rows === null || rows.length === 0) ? (
          <EmptyState icon={icon} title={empty.title} message={empty.message} action={empty.action} />
        ) : null}
        {groups.map((group) => {
          const inGroup = (rows ?? []).filter((r) => group.statuses.includes(r.status));
          if (inGroup.length === 0) return null;
          return (
            <View key={group.title} style={{ gap: spacing.sm }}>
              <SectionTitle>
                {group.title} · {inGroup.length}
              </SectionTitle>
              {inGroup.map((row) => (
                <FadeInView key={row._id} delay={stagger(index++)}>
                  {renderRow(row)}
                </FadeInView>
              ))}
            </View>
          );
        })}
        {footer}
      </View>
    </ReadableColumn>
  );
};

export const EarlierRows = <Row extends { _id: string }>({
  history,
  renderRow,
}: {
  history: ReturnType<typeof useEarlierYears<Row>>;
  renderRow: (row: Row) => ReactNode;
}) => (
  <EarlierYears
    groups={history.groups}
    hasMore={history.hasMore}
    loadingMore={history.loadingMore}
    onLoadMore={history.loadMore}
    renderRows={(rows) => rows.map((row) => <Fragment key={row._id}>{renderRow(row)}</Fragment>)}
  />
);
