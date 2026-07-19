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
  addListMember,
  archiveFieldDefinition,
  createStatus,
  removeListMember,
  setListPrivacy,
} from "@/modules/tasks/actions";
import { FieldDefinitionForm } from "@/modules/tasks/components/field-definition-form";
import { LayoutBuilder } from "@/modules/tasks/components/layout-builder";
import { ListPrivacyToggle } from "@/modules/tasks/components/list-privacy-toggle";
import { SharingDialogBody } from "@/modules/tasks/components/sharing-dialog-body";
import { StatusManager } from "@/modules/tasks/components/status-manager";
import { defaultLayout, type TaskLayout } from "@/modules/tasks/layout-types";
import {
  getActiveUsers,
  getFieldDefinitions,
  getListBySlug,
  getListMembers,
  getSpaceBySlug,
  getSpaceMembers,
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

  const [listStatuses, fieldDefs, inheritedMembers, directMembers, activeUsers] = await Promise.all([
    getStatusesForList(list.id),
    getFieldDefinitions(list.id, true),
    getSpaceMembers(space.id),
    getListMembers(list.id),
    getActiveUsers(),
  ]);
  const directMemberIds = new Set(directMembers.map((m) => m.userId));
  const addableUsers = activeUsers.filter((u) => !directMemberIds.has(u.id));

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
          <TabsTrigger value="sharing">Sharing</TabsTrigger>
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
              <CardDescription>
                Workflow columns for this list. Drag to reorder or move between groups; use the
                pencil to rename or recolor.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <StatusManager
                listId={list.id}
                initialStatuses={listStatuses}
                defaultStatusId={list.defaultStatusId}
              />

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
                  <Label htmlFor="s-category">Group</Label>
                  <select
                    id="s-category"
                    name="category"
                    className="h-9 rounded-md border bg-transparent px-3 text-sm"
                  >
                    <option value="open">Not Started</option>
                    <option value="active">Active</option>
                    <option value="done">Done</option>
                    <option value="cancelled">Closed</option>
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

        {/* ── sharing tab ── */}
        <TabsContent value="sharing">
          <Card>
            <CardHeader>
              <CardTitle>Sharing</CardTitle>
              <CardDescription>
                <strong>Public</strong> (default): every space member gets access automatically.{" "}
                <strong>Private</strong>: nobody carries over — you add exactly who should have
                access, including people who aren&apos;t in the space at all.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ListPrivacyToggle listId={list.id} isPrivate={list.isPrivate} />
              <SharingDialogBody
                idFieldName="listId"
                idValue={list.id}
                members={directMembers}
                addableUsers={addableUsers}
                addAction={addListMember}
                removeAction={removeListMember}
                inheritedMembers={inheritedMembers}
                isPrivate={list.isPrivate}
                lockAction={setListPrivacy}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
