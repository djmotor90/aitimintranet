import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { assertSpaceRole, requireUser } from "@/lib/rbac";
import {
  archiveFieldDefinition,
  createStatus,
  deleteStatus,
} from "@/modules/tasks/actions";
import { FieldDefinitionForm } from "@/modules/tasks/components/field-definition-form";
import { LayoutBuilder } from "@/modules/tasks/components/layout-builder";
import { defaultLayout, type TaskLayout } from "@/modules/tasks/layout-types";
import {
  getFieldDefinitions,
  getListBySlug,
  getSpaceBySlug,
  getStatusesForList,
} from "@/modules/tasks/queries";


export default async function ListSettingsPage(props: {
  params: Promise<{ spaceSlug: string; listSlug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { spaceSlug, listSlug } = await props.params;
  const { tab } = await props.searchParams;
  await requireUser();
  const space = await getSpaceBySlug(spaceSlug);
  if (!space) notFound();
  await assertSpaceRole(space.id, "owner");
  const list = await getListBySlug(space.id, listSlug);
  if (!list) notFound();

  const [listStatuses, fieldDefs] = await Promise.all([
    getStatusesForList(list.id),
    getFieldDefinitions(list.id, true),
  ]);

  const activeFieldDefs = fieldDefs.filter((f) => !f.isArchived);
  const savedLayout = list.taskLayout as TaskLayout | null;
  const layout = savedLayout ?? defaultLayout(activeFieldDefs);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <div className="text-sm text-muted-foreground">
          <Link href={`/tasks/${space.slug}/${list.slug}`} className="hover:underline">
            {space.name} / {list.name}
          </Link>
        </div>
        <h1 className="text-2xl font-semibold">List settings</h1>
      </div>

      <Tabs defaultValue={tab ?? "layout"}>
        <TabsList className="mb-4">
          <TabsTrigger value="layout">Task layout</TabsTrigger>
          <TabsTrigger value="statuses">Statuses</TabsTrigger>
          <TabsTrigger value="fields">Custom fields</TabsTrigger>
        </TabsList>

        {/* ── task layout tab ── */}
        <TabsContent value="layout">
          <Card>
            <CardHeader>
              <CardTitle>Task layout</CardTitle>
              <CardDescription>
                Group and arrange fields shown when a task is opened. Drag fields between groups,
                reorder groups, and pick how many columns each group uses.
                Fields left in <strong>Unassigned</strong> are hidden from the task view.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LayoutBuilder
                listId={list.id}
                initialLayout={layout}
                fieldDefs={activeFieldDefs}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── statuses tab ── */}
        <TabsContent value="statuses">
          <Card>
            <CardHeader>
              <CardTitle>Statuses</CardTitle>
              <CardDescription>Workflow columns for this list, in order.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ul className="flex flex-col gap-2">
                {listStatuses.map((s) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <span className="size-3 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="font-medium">{s.name}</span>
                    <Badge variant="outline">{s.category}</Badge>
                    {list.defaultStatusId === s.id && <Badge variant="secondary">default</Badge>}
                    <form action={deleteStatus} className="ml-auto">
                      <input type="hidden" name="statusId" value={s.id} />
                      <Button variant="ghost" size="sm" type="submit">
                        Delete
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
              <form action={createStatus} className="flex flex-wrap items-end gap-2 border-t pt-4">
                <input type="hidden" name="listId" value={list.id} />
                <div className="flex flex-col gap-1">
                  <Label htmlFor="s-name">Name</Label>
                  <Input id="s-name" name="name" required className="w-40" />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="s-color">Color</Label>
                  <Input id="s-color" name="color" type="color" defaultValue="#94a3b8" className="w-16 p-1" />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="s-category">Category</Label>
                  <select
                    id="s-category"
                    name="category"
                    className="h-9 rounded-md border bg-transparent px-3 text-sm"
                  >
                    <option value="open">open</option>
                    <option value="active">active</option>
                    <option value="done">done</option>
                    <option value="cancelled">cancelled</option>
                  </select>
                </div>
                <Button type="submit">Add status</Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── custom fields tab ── */}
        <TabsContent value="fields">
          <Card>
            <CardHeader>
              <CardTitle>Custom fields</CardTitle>
              <CardDescription>
                Fields attached to every task in this list. Archiving keeps historical values readable.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ul className="flex flex-col gap-2">
                {fieldDefs.map((f) => (
                  <li key={f.id} className="flex items-center gap-2">
                    <span className={f.isArchived ? "text-muted-foreground line-through" : "font-medium"}>
                      {f.label}
                    </span>
                    <Badge variant="outline">{f.type}</Badge>
                    {f.isRequired && <Badge variant="secondary">required</Badge>}
                    {!f.isArchived && (
                      <form action={archiveFieldDefinition} className="ml-auto">
                        <input type="hidden" name="fieldId" value={f.id} />
                        <Button variant="ghost" size="sm" type="submit">
                          Archive
                        </Button>
                      </form>
                    )}
                  </li>
                ))}
                {fieldDefs.length === 0 && (
                  <li className="text-sm text-muted-foreground">No custom fields yet.</li>
                )}
              </ul>
              <FieldDefinitionForm listId={list.id} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
