// Built-in template catalog + default categories.
// Lives in lib/ (not app/) because the pg-boss worker also imports these, and Dockerfile.worker only copies lib/, config/, scripts/.

type PropOption = { name: string; color: string };
type Prop = {
  name: string;
  type: string;
  multiple?: boolean;
  options?: PropOption[];
  expression?: string;
  voteMode?: boolean;
};
type View = {
  name: string;
  type: "table" | "board" | "calendar" | "gantt";
  isDefault?: boolean;
  groupBy?: string;
  ganttStart?: string;
  ganttEnd?: string;
  filterKey?: string;
  filterValue?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
};
type SampleRow = Record<string, string | number>;
type DbSchema = { properties: Prop[]; views: View[]; sample_rows: SampleRow[] };

type SnapshotBlock = {
  id: string;
  type: string;
  content: unknown;
  schema_version: number;
  order_index: number;
  parent_block_id: string | null;
  children: SnapshotBlock[];
};

type PageSnapshotSeed = {
  title: string;
  icon: string;
  cover_url: null;
  is_full_width: boolean;
  font_family: string;
  blocks: SnapshotBlock[];
  subpages: never[];
  database_schema?: DbSchema;
};

function block(
  type: string,
  content: unknown,
  order_index: number,
  children: SnapshotBlock[] = []
): SnapshotBlock {
  return {
    id: crypto.randomUUID(),
    type,
    content,
    schema_version: 1,
    order_index,
    parent_block_id: null,
    children,
  };
}

function text(value: string) {
  return { text: [{ text: value, marks: [] }] };
}

function dbSnap(
  title: string,
  icon: string,
  tagline: string,
  schema: DbSchema
): PageSnapshotSeed {
  return {
    title,
    icon,
    cover_url: null,
    is_full_width: false,
    font_family: "default",
    blocks: [block("paragraph", text(tagline), 0)],
    subpages: [],
    database_schema: schema,
  };
}

// A plain content page (no database) — used for onboarding-style templates
// like "Getting Started" and "Daily Journal" that are just blocks, not a
// table/board of records.
function pageSnap(
  title: string,
  icon: string,
  blocks: SnapshotBlock[]
): PageSnapshotSeed {
  return {
    title,
    icon,
    cover_url: null,
    is_full_width: false,
    font_family: "default",
    blocks,
    subpages: [],
  };
}

// Mirrors the rows inserted by drizzle/0017_simple_bedlam.sql — kept here too
// so template auto-seeding is self-healing even if that migration hasn't
// run yet (see doc/bugs/2026-07-15-templates-not-auto-seeding.md).
export const DEFAULT_TEMPLATE_CATEGORIES: {
  key: string;
  label: string;
  orderIndex: number;
}[] = [
  { key: "productivity", label: "Productivity", orderIndex: 0 },
  { key: "project_mgmt", label: "Project Management", orderIndex: 1 },
  { key: "marketing", label: "Marketing & Content", orderIndex: 2 },
  { key: "engineering", label: "Engineering & Docs", orderIndex: 3 },
  { key: "sales", label: "Sales & Finance", orderIndex: 4 },
];

export const BUILT_IN_TEMPLATES: {
  name: string;
  description: string;
  category:
    | "productivity"
    | "project_mgmt"
    | "marketing"
    | "engineering"
    | "sales";
  pageSnapshot: PageSnapshotSeed;
}[] = [
  // ── Onboarding ───────────────────────────────────────────────────────────────

  {
    name: "Getting Started",
    description: "A quick intro guide to your new workspace.",
    category: "productivity",
    pageSnapshot: pageSnap("Getting Started", "👋", [
      block(
        "paragraph",
        text(
          "Welcome to Pagevo! Here's how to get the most out of your workspace."
        ),
        0
      ),
      block(
        "todo",
        { checked: true, ...text("Open this page — you're already here 🎉") },
        1
      ),
      block(
        "todo",
        {
          checked: false,
          ...text(
            'Click anywhere below and type "/" to see what you can create — headings, tables, to-dos, and more'
          ),
        },
        2
      ),
      block(
        "todo",
        {
          checked: false,
          ...text(
            "Use the sidebar to organize pages into a tree — drag and drop to reorder or nest them"
          ),
        },
        3
      ),
      block(
        "todo",
        {
          checked: false,
          ...text("Invite your teammates from Workspace Settings → Members"),
        },
        4
      ),
      block("toggle", text("A few more tips"), 5, [
        block(
          "paragraph",
          text(
            "Press Cmd/Ctrl+K to search across every page in your workspace."
          ),
          0
        ),
        block(
          "paragraph",
          text('Turn any page into a reusable template from its "•••" menu.'),
          1
        ),
        block(
          "paragraph",
          text("Star pages from the sidebar to pin your favorites at the top."),
          2
        ),
      ]),
    ]),
  },

  {
    name: "Daily Journal",
    description: "Daily reflections and ideas.",
    category: "productivity",
    pageSnapshot: pageSnap("Daily Journal", "📔", [
      block(
        "paragraph",
        text("A simple space for daily reflections and ideas."),
        0
      ),
      block("h2", text("Today"), 1),
      block("todo", { checked: false, ...text("What went well today?") }, 2),
      block("todo", { checked: false, ...text("What could be better?") }, 3),
      block(
        "todo",
        { checked: false, ...text("One thing I'm grateful for") },
        4
      ),
      block("toggle", text("More writing prompts"), 5, [
        block("paragraph", text("What did I learn today?"), 0),
        block("paragraph", text("What's one small win from today?"), 1),
        block("paragraph", text("What's on my mind for tomorrow?"), 2),
      ]),
    ]),
  },

  // ── Productivity ─────────────────────────────────────────────────────────────

  {
    name: "Meeting Notes",
    description: "Capture every meeting, stay on top of every decision.",
    category: "productivity",
    pageSnapshot: dbSnap(
      "Meeting Notes",
      '{"type":"icon","name":"MessageSquare","color":"#3b82f6"}',
      "Capture every meeting, stay on top of every decision.",
      {
        properties: [
          { name: "Meeting name", type: "title" },
          { name: "Date", type: "date" },
          {
            name: "Category",
            type: "select",
            options: [
              { name: "Retro", color: "red" },
              { name: "Standup", color: "blue" },
              { name: "Presentation", color: "green" },
            ],
          },
          { name: "Attendees", type: "person", multiple: true },
          { name: "Created by", type: "created_by" },
        ],
        views: [
          { name: "All Meetings", type: "table", isDefault: true },
          {
            name: "My Notes",
            type: "table",
            filterKey: "Created by",
            filterValue: "me",
          },
        ],
        sample_rows: [
          {
            "Meeting name": "Product release post-mortem",
            Date: "2025-02-13",
            Category: "Retro",
          },
          {
            "Meeting name": "Weekly team sync",
            Date: "2025-02-13",
            Category: "Standup",
          },
          {
            "Meeting name": "GTM strategy presentation",
            Date: "2025-02-13",
            Category: "Presentation",
          },
        ],
      }
    ),
  },

  {
    name: "Tasks Tracker",
    description: "Stay organized with tasks, your way.",
    category: "productivity",
    pageSnapshot: dbSnap(
      "Tasks Tracker",
      '{"type":"icon","name":"Clipboard","color":"#22c55e"}',
      "Stay organized with tasks, your way.",
      {
        properties: [
          { name: "Task name", type: "title" },
          {
            name: "Status",
            type: "select",
            options: [
              { name: "Done", color: "green" },
              { name: "In progress", color: "blue" },
              { name: "Not started", color: "gray" },
            ],
          },
          { name: "Assignee", type: "person" },
          { name: "Due date", type: "date" },
          {
            name: "Priority",
            type: "select",
            options: [
              { name: "High", color: "red" },
              { name: "Medium", color: "orange" },
              { name: "Low", color: "gray" },
            ],
          },
          {
            name: "Task type",
            type: "select",
            options: [
              { name: "Polish", color: "pink" },
              { name: "Feature request", color: "green" },
              { name: "Bug", color: "red" },
              { name: "Research", color: "purple" },
              { name: "Chore", color: "gray" },
            ],
          },
          { name: "Description", type: "text" },
          {
            name: "Effort level",
            type: "select",
            options: [
              { name: "Small", color: "green" },
              { name: "Medium", color: "orange" },
              { name: "Large", color: "red" },
            ],
          },
        ],
        views: [
          { name: "All Tasks", type: "table", isDefault: true },
          { name: "By Status", type: "board", groupBy: "Status" },
          {
            name: "My Tasks",
            type: "table",
            filterKey: "Assignee",
            filterValue: "me",
          },
        ],
        sample_rows: [
          {
            "Task name": "Improve website copy",
            Status: "Done",
            "Due date": "2025-02-03",
            Priority: "High",
            "Task type": "Polish",
            Description:
              "Update the homepage headline and button copy to better reflect our latest positioning.",
            "Effort level": "Medium",
          },
          {
            "Task name": "Update help center & FAQ",
            Status: "In progress",
            "Due date": "2025-02-20",
            Priority: "Medium",
            "Task type": "Feature request",
            Description:
              "Refresh support articles and FAQ answers to reflect recent product changes.",
            "Effort level": "Small",
          },
          {
            "Task name": "Publish release notes",
            Status: "Not started",
            "Due date": "2025-02-28",
            Priority: "Low",
            "Task type": "Feature request",
            Description:
              "Write and publish release notes covering this month's product updates.",
            "Effort level": "Small",
          },
        ],
      }
    ),
  },

  {
    name: "Goals Tracker",
    description: "Align your team's objectives. Track progress seamlessly.",
    category: "productivity",
    pageSnapshot: dbSnap(
      "Goals Tracker",
      '{"type":"icon","name":"Target","color":"#ef4444"}',
      "Align your team's objectives. Track progress seamlessly.",
      {
        properties: [
          { name: "Goal name", type: "title" },
          { name: "Owner", type: "person" },
          {
            name: "Status",
            type: "select",
            options: [
              { name: "In progress", color: "blue" },
              { name: "Not started", color: "gray" },
              { name: "Done", color: "green" },
            ],
          },
          { name: "Due date", type: "date" },
          {
            name: "Priority",
            type: "select",
            options: [
              { name: "High", color: "red" },
              { name: "Medium", color: "orange" },
              { name: "Low", color: "gray" },
            ],
          },
          {
            name: "Team",
            type: "select",
            options: [
              { name: "Business Development", color: "blue" },
              { name: "Account Management", color: "purple" },
              { name: "Engineering", color: "green" },
              { name: "Marketing", color: "pink" },
              { name: "Product", color: "orange" },
            ],
          },
        ],
        views: [
          { name: "All Goals", type: "table", isDefault: true },
          { name: "By Status", type: "board", groupBy: "Status" },
          {
            name: "My Goals",
            type: "table",
            filterKey: "Owner",
            filterValue: "me",
          },
        ],
        sample_rows: [
          {
            "Goal name": "Increase sales by 20%",
            Status: "In progress",
            "Due date": "2025-02-26",
            Priority: "High",
            Team: "Business Development",
          },
          {
            "Goal name": "Launch 3 new products",
            Status: "Not started",
            "Due date": "2025-04-16",
            Priority: "Medium",
            Team: "Account Management",
          },
          {
            "Goal name": "Acquire 20K new users",
            Status: "Done",
            "Due date": "2025-02-03",
            Priority: "Medium",
            Team: "Business Development",
          },
        ],
      }
    ),
  },

  {
    name: "Brainstorm Session",
    description: "Capture ideas. Prioritize together.",
    category: "productivity",
    pageSnapshot: dbSnap(
      "Brainstorm Session",
      '{"type":"icon","name":"Lightbulb","color":"#f59e0b"}',
      "Capture ideas. Prioritize together.",
      {
        properties: [
          { name: "Idea", type: "title" },
          { name: "Created by", type: "created_by" },
          {
            name: "Priority",
            type: "select",
            options: [
              { name: "High", color: "red" },
              { name: "Medium", color: "orange" },
              { name: "Low", color: "gray" },
            ],
          },
          {
            name: "Category",
            type: "select",
            options: [
              { name: "Activation", color: "orange" },
              { name: "Conversion", color: "blue" },
              { name: "Top of funnel", color: "green" },
              { name: "Retention", color: "purple" },
            ],
          },
          {
            name: "Upvoted by",
            type: "person",
            multiple: true,
            voteMode: true,
          },
        ],
        views: [
          { name: "All Ideas", type: "table", isDefault: true },
          { name: "By category", type: "board", groupBy: "Category" },
        ],
        sample_rows: [
          {
            Idea: "Launch back to school campaign",
            Priority: "High",
            Category: "Activation",
          },
          {
            Idea: "Simplify onboarding experience",
            Priority: "Medium",
            Category: "Conversion",
          },
          { Idea: "Improve SEO", Priority: "Low", Category: "Top of funnel" },
        ],
      }
    ),
  },

  // ── Project Management ──────────────────────────────────────────────────────

  {
    name: "Projects",
    description: "Manage and execute projects from start to finish.",
    category: "project_mgmt",
    pageSnapshot: dbSnap(
      "Projects",
      '{"type":"icon","name":"Briefcase","color":"#6366f1"}',
      "Manage and execute projects from start to finish.",
      {
        properties: [
          { name: "Project name", type: "title" },
          { name: "Assignee", type: "person" },
          {
            name: "Status",
            type: "select",
            options: [
              { name: "Not started", color: "gray" },
              { name: "In progress", color: "blue" },
              { name: "Done", color: "green" },
            ],
          },
          { name: "Start date", type: "date" },
          { name: "End date", type: "date" },
          {
            name: "Priority",
            type: "select",
            options: [
              { name: "High", color: "red" },
              { name: "Medium", color: "orange" },
              { name: "Low", color: "gray" },
            ],
          },
          {
            name: "Team",
            type: "select",
            options: [
              { name: "Account Management", color: "purple" },
              { name: "Human Resources", color: "pink" },
              { name: "Product Design", color: "green" },
              { name: "Engineering", color: "blue" },
              { name: "Marketing", color: "orange" },
            ],
          },
          { name: "Attach file", type: "files" },
        ],
        views: [
          {
            name: "By Status",
            type: "board",
            isDefault: true,
            groupBy: "Status",
          },
          { name: "All Projects", type: "table" },
        ],
        sample_rows: [
          {
            "Project name": "Quarterly sales planning",
            Status: "Not started",
            "Start date": "2025-03-24",
            "End date": "2025-03-28",
            Priority: "Medium",
            Team: "Account Management",
          },
          {
            "Project name": "Public launch of iOS app",
            Status: "In progress",
            "Start date": "2025-04-09",
            "End date": "2025-04-30",
            Priority: "High",
            Team: "Product Design",
          },
          {
            "Project name": "Revamp new hire onboarding",
            Status: "Done",
            "Start date": "2025-01-20",
            "End date": "2025-02-04",
            Priority: "Low",
            Team: "Human Resources",
          },
        ],
      }
    ),
  },

  {
    name: "Issue Tracking",
    description:
      "Easily manage issues and feedback to ensure timely resolutions.",
    category: "project_mgmt",
    pageSnapshot: dbSnap(
      "Issue Tracking",
      '{"type":"icon","name":"AlertCircle","color":"#ef4444"}',
      "Easily manage issues and feedback to ensure timely resolutions.",
      {
        properties: [
          { name: "Issue name", type: "title" },
          {
            name: "Status",
            type: "select",
            options: [
              { name: "Backlog", color: "gray" },
              { name: "Open", color: "red" },
              { name: "In progress", color: "blue" },
              { name: "In review", color: "purple" },
              { name: "Testing", color: "orange" },
              { name: "Won't fix", color: "gray" },
              { name: "Done", color: "green" },
            ],
          },
          {
            name: "Priority",
            type: "select",
            options: [
              { name: "High", color: "red" },
              { name: "Medium", color: "orange" },
              { name: "Low", color: "gray" },
            ],
          },
          { name: "Assignee", type: "person" },
          { name: "Reporter", type: "person" },
        ],
        views: [
          { name: "Kanban", type: "board", isDefault: true, groupBy: "Status" },
          { name: "All Issues", type: "table" },
          {
            name: "My Issues",
            type: "table",
            filterKey: "Assignee",
            filterValue: "me",
          },
        ],
        sample_rows: [
          { "Issue name": "New issue 1", Status: "Open", Priority: "High" },
          {
            "Issue name": "New issue 2",
            Status: "In progress",
            Priority: "Medium",
          },
        ],
      }
    ),
  },

  {
    name: "Feature Requests",
    description: "Track and assign new feature requests.",
    category: "project_mgmt",
    pageSnapshot: dbSnap(
      "Feature Requests",
      '{"type":"icon","name":"Star","color":"#f97316"}',
      "Track and assign new feature requests.",
      {
        properties: [
          { name: "Request name", type: "title" },
          {
            name: "Status",
            type: "select",
            options: [
              { name: "New", color: "gray" },
              { name: "Under Review", color: "orange" },
              { name: "Planned", color: "yellow" },
              { name: "In Development", color: "blue" },
              { name: "Launched", color: "green" },
              { name: "Declined", color: "red" },
            ],
          },
          { name: "Assignee", type: "person" },
          {
            name: "Priority",
            type: "select",
            options: [
              { name: "High", color: "red" },
              { name: "Medium", color: "orange" },
              { name: "Low", color: "gray" },
            ],
          },
        ],
        views: [
          {
            name: "By Status",
            type: "board",
            isDefault: true,
            groupBy: "Status",
          },
          { name: "All Requests", type: "table" },
          {
            name: "Assigned to Me",
            type: "table",
            filterKey: "Assignee",
            filterValue: "me",
          },
        ],
        sample_rows: [
          { "Request name": "Drawing feature", Status: "New" },
          { "Request name": "New integration", Status: "Under Review" },
          { "Request name": "Easier login", Status: "In Development" },
        ],
      }
    ),
  },

  {
    name: "Creative Projects",
    description: "Efficiently organize and manage creative projects.",
    category: "project_mgmt",
    pageSnapshot: dbSnap(
      "Creative Projects",
      '{"type":"icon","name":"Gem","color":"#ec4899"}',
      "Efficiently organize and manage creative projects.",
      {
        properties: [
          { name: "Project name", type: "title" },
          {
            name: "Status",
            type: "select",
            options: [
              { name: "Not started", color: "gray" },
              { name: "In progress", color: "blue" },
              { name: "Needs review", color: "orange" },
              { name: "In review", color: "purple" },
              { name: "Done", color: "green" },
            ],
          },
          {
            name: "Type",
            type: "select",
            options: [
              { name: "Branding", color: "pink" },
              { name: "Illustration", color: "orange" },
              { name: "Photography", color: "blue" },
              { name: "Video", color: "red" },
              { name: "Copywriting", color: "green" },
            ],
          },
          { name: "Owner", type: "person" },
        ],
        views: [
          {
            name: "By Status",
            type: "board",
            isDefault: true,
            groupBy: "Status",
          },
          { name: "All Projects", type: "table" },
          {
            name: "My Projects",
            type: "table",
            filterKey: "Owner",
            filterValue: "me",
          },
        ],
        sample_rows: [
          {
            "Project name": "Project 1",
            Status: "Needs review",
            Type: "Photography",
          },
          {
            "Project name": "Project 2",
            Status: "In progress",
            Type: "Illustration",
          },
          {
            "Project name": "Project 3",
            Status: "Not started",
            Type: "Branding",
          },
        ],
      }
    ),
  },

  // ── Marketing & Content ─────────────────────────────────────────────────────

  {
    name: "Campaign Management",
    description: "Plan and track your campaigns.",
    category: "marketing",
    pageSnapshot: dbSnap(
      "Campaign Management",
      '{"type":"icon","name":"Send","color":"#8b5cf6"}',
      "Plan and track your campaigns.",
      {
        properties: [
          { name: "Campaign name", type: "title" },
          {
            name: "Status",
            type: "select",
            options: [
              { name: "Blocked", color: "red" },
              { name: "Not started", color: "gray" },
              { name: "Planning", color: "yellow" },
              { name: "On Hold", color: "orange" },
              { name: "In Production", color: "blue" },
              { name: "Launched", color: "green" },
              { name: "Done", color: "gray" },
            ],
          },
          {
            name: "Channel",
            type: "multi_select",
            options: [
              { name: "X", color: "gray" },
              { name: "LinkedIn", color: "blue" },
              { name: "Instagram", color: "pink" },
              { name: "Email", color: "orange" },
              { name: "YouTube", color: "red" },
              { name: "Facebook", color: "blue" },
            ],
          },
          {
            name: "Region",
            type: "multi_select",
            options: [
              { name: "EMEA", color: "blue" },
              { name: "AMER", color: "green" },
              { name: "APAC", color: "orange" },
              { name: "Global", color: "purple" },
            ],
          },
          {
            name: "Campaign type",
            type: "multi_select",
            options: [
              { name: "Product launch", color: "blue" },
              { name: "Sales promotion", color: "green" },
              { name: "Brand awareness", color: "purple" },
              { name: "Event", color: "orange" },
            ],
          },
          { name: "Start date", type: "date" },
        ],
        views: [
          {
            name: "By Status",
            type: "board",
            isDefault: true,
            groupBy: "Status",
          },
          { name: "All Campaigns", type: "table" },
          { name: "Calendar", type: "calendar" },
        ],
        sample_rows: [
          {
            "Campaign name": "New mobile app",
            Status: "Blocked",
            Channel: "X",
            Region: "EMEA",
            "Campaign type": "Product launch",
          },
          {
            "Campaign name": "Engineering content",
            Status: "Not started",
            Channel: "LinkedIn",
            Region: "AMER",
            "Campaign type": "Sales promotion",
          },
          {
            "Campaign name": "Win the market",
            Status: "Planning",
            Channel: "Instagram",
            Region: "APAC",
            "Campaign type": "Brand awareness",
          },
        ],
      }
    ),
  },

  {
    name: "Content Calendar",
    description: "Plan and manage your content pipeline.",
    category: "marketing",
    pageSnapshot: dbSnap(
      "Content Calendar",
      '{"type":"icon","name":"Calendar","color":"#14b8a6"}',
      "Plan and manage your content pipeline.",
      {
        properties: [
          { name: "Content title", type: "title" },
          {
            name: "Status",
            type: "select",
            options: [
              { name: "Idea", color: "gray" },
              { name: "Draft", color: "orange" },
              { name: "In Review", color: "blue" },
              { name: "Scheduled", color: "purple" },
              { name: "Published", color: "green" },
            ],
          },
          {
            name: "Channel",
            type: "select",
            options: [
              { name: "Blog", color: "blue" },
              { name: "Twitter/X", color: "gray" },
              { name: "LinkedIn", color: "blue" },
              { name: "Email", color: "orange" },
              { name: "YouTube", color: "red" },
              { name: "Instagram", color: "pink" },
            ],
          },
          { name: "Publish date", type: "date" },
          { name: "Author", type: "person" },
          {
            name: "Tags",
            type: "multi_select",
            options: [
              { name: "Product", color: "blue" },
              { name: "Engineering", color: "green" },
              { name: "Marketing", color: "pink" },
              { name: "Company", color: "purple" },
            ],
          },
        ],
        views: [
          { name: "Calendar", type: "calendar", isDefault: true },
          { name: "All Content", type: "table" },
          { name: "By Status", type: "board", groupBy: "Status" },
        ],
        sample_rows: [],
      }
    ),
  },

  {
    name: "Social Media Planner",
    description: "Plan and manage your social media content.",
    category: "marketing",
    pageSnapshot: dbSnap(
      "Social Media Planner",
      '{"type":"icon","name":"Share","color":"#3b82f6"}',
      "Plan and manage your social media content.",
      {
        properties: [
          { name: "Post title", type: "title" },
          {
            name: "Status",
            type: "select",
            options: [
              { name: "Idea", color: "gray" },
              { name: "Draft", color: "orange" },
              { name: "Scheduled", color: "blue" },
              { name: "Published", color: "green" },
            ],
          },
          {
            name: "Platform",
            type: "select",
            options: [
              { name: "Instagram", color: "pink" },
              { name: "Twitter/X", color: "gray" },
              { name: "LinkedIn", color: "blue" },
              { name: "Facebook", color: "blue" },
              { name: "YouTube", color: "red" },
              { name: "TikTok", color: "gray" },
            ],
          },
          { name: "Scheduled date", type: "date" },
          { name: "Author", type: "person" },
        ],
        views: [
          { name: "Calendar", type: "calendar", isDefault: true },
          { name: "All Posts", type: "table" },
          { name: "By Status", type: "board", groupBy: "Status" },
        ],
        sample_rows: [],
      }
    ),
  },

  {
    name: "Event Management",
    description: "Plan and manage your events.",
    category: "marketing",
    pageSnapshot: dbSnap(
      "Event Management",
      '{"type":"icon","name":"Compass","color":"#f97316"}',
      "Plan and manage your events.",
      {
        properties: [
          { name: "Event name", type: "title" },
          { name: "Event date", type: "date" },
          {
            name: "Status",
            type: "select",
            options: [
              { name: "Registration open", color: "blue" },
              { name: "Planning", color: "orange" },
              { name: "Done", color: "green" },
            ],
          },
          { name: "Event owner", type: "person" },
          {
            name: "Format",
            type: "select",
            options: [
              { name: "In person", color: "green" },
              { name: "Virtual", color: "blue" },
            ],
          },
          {
            name: "Category",
            type: "select",
            options: [
              { name: "Community meetup", color: "blue" },
              { name: "Internal event", color: "gray" },
              { name: "Conference", color: "purple" },
              { name: "Webinar", color: "orange" },
            ],
          },
          { name: "Venue", type: "text" },
        ],
        views: [
          { name: "All Events", type: "table", isDefault: true },
          { name: "By Status", type: "board", groupBy: "Status" },
          { name: "Calendar", type: "calendar" },
        ],
        sample_rows: [
          {
            "Event name": "Make with Pagevo",
            "Event date": "2025-09-16",
            Status: "Registration open",
            Format: "In person",
            Category: "Community meetup",
            Venue: "Venue 3",
          },
          {
            "Event name": "Fireside chat",
            "Event date": "2025-03-13",
            Status: "Planning",
            Format: "In person",
            Category: "Internal event",
            Venue: "Venue 2",
          },
          {
            "Event name": "VIP dinner",
            "Event date": "2025-02-12",
            Status: "Done",
            Format: "Virtual",
            Category: "Community meetup",
            Venue: "Venue 1",
          },
        ],
      }
    ),
  },

  // ── Engineering & Docs ──────────────────────────────────────────────────────

  {
    name: "Document Hub",
    description: "Create and collaborate on documents in one place.",
    category: "engineering",
    pageSnapshot: dbSnap(
      "Document Hub",
      '{"type":"icon","name":"BookOpen","color":"#22c55e"}',
      "Create and collaborate on documents in one place.",
      {
        properties: [
          { name: "Doc name", type: "title" },
          {
            name: "Category",
            type: "select",
            options: [
              { name: "Strategy doc", color: "orange" },
              { name: "Proposal", color: "blue" },
              { name: "Customer research", color: "green" },
              { name: "Report", color: "purple" },
              { name: "Other", color: "gray" },
            ],
          },
          { name: "Created by", type: "created_by" },
          { name: "Created time", type: "created_time" },
          { name: "Last edited by", type: "last_edited_by" },
          { name: "Last updated time", type: "last_edited_time" },
        ],
        views: [
          { name: "All Docs", type: "table", isDefault: true },
          {
            name: "My Docs",
            type: "table",
            filterKey: "Created by",
            filterValue: "me",
          },
        ],
        sample_rows: [
          {
            "Doc name": "Company mission and strategy",
            Category: "Strategy doc",
          },
          {
            "Doc name": "Proposal for new year campaign",
            Category: "Proposal",
          },
          {
            "Doc name": "Customer feedback report",
            Category: "Customer research",
          },
        ],
      }
    ),
  },

  {
    name: "Engineering Docs",
    description: "Organize documents for transparent team communication.",
    category: "engineering",
    pageSnapshot: dbSnap(
      "Engineering Docs",
      '{"type":"icon","name":"Code","color":"#6b7280"}',
      "Organize documents for transparent team communication.",
      {
        properties: [
          { name: "Doc name", type: "title" },
          { name: "Author", type: "person" },
          {
            name: "Status",
            type: "select",
            options: [
              { name: "Draft", color: "gray" },
              { name: "In Review", color: "blue" },
              { name: "Published", color: "green" },
            ],
          },
          {
            name: "Category",
            type: "multi_select",
            options: [
              { name: "PRD", color: "blue" },
              { name: "Best Practices", color: "green" },
              { name: "Guide", color: "orange" },
              { name: "RFC", color: "purple" },
              { name: "Runbook", color: "red" },
            ],
          },
          { name: "Last edited time", type: "last_edited_time" },
        ],
        views: [
          { name: "All Docs", type: "table", isDefault: true },
          {
            name: "Published Docs",
            type: "table",
            filterKey: "Status",
            filterValue: "Published",
          },
          { name: "Docs by Category", type: "table", groupBy: "Category" },
        ],
        sample_rows: [
          { "Doc name": "New feature PRD", Status: "Draft", Category: "PRD" },
          {
            "Doc name": "New engineering doc",
            Status: "Published",
            Category: "Best Practices",
          },
          { "Doc name": "User guide", Status: "In Review", Category: "Guide" },
        ],
      }
    ),
  },

  // ── Sales & Finance ─────────────────────────────────────────────────────────

  {
    name: "Pipeline Tracking",
    description: "Track your sales pipeline.",
    category: "sales",
    pageSnapshot: dbSnap(
      "Pipeline Tracking",
      '{"type":"icon","name":"TrendingUp","color":"#22c55e"}',
      "Track your sales pipeline.",
      {
        properties: [
          { name: "Deal name", type: "title" },
          {
            name: "Deal Stage",
            type: "select",
            options: [
              { name: "New", color: "green" },
              { name: "Discovery", color: "blue" },
              { name: "Negotiation", color: "orange" },
              { name: "Won", color: "green" },
              { name: "Lost", color: "red" },
              { name: "No Deal", color: "gray" },
            ],
          },
          {
            name: "Priority",
            type: "select",
            options: [
              { name: "High", color: "red" },
              { name: "Medium", color: "orange" },
              { name: "Low", color: "gray" },
            ],
          },
          { name: "Owner", type: "person" },
          { name: "Company", type: "text" },
          { name: "Value", type: "number" },
        ],
        views: [
          {
            name: "By Deal Stage",
            type: "board",
            isDefault: true,
            groupBy: "Deal Stage",
          },
          { name: "All Deals", type: "table" },
          { name: "Active Deals", type: "table" },
        ],
        sample_rows: [
          {
            "Deal name": "Auto manufacturer",
            "Deal Stage": "New",
            Priority: "High",
            Company: "Meridian Motors",
          },
          {
            "Deal name": "Software tech company",
            "Deal Stage": "Discovery",
            Priority: "Low",
            Company: "Nimbus Software",
          },
          {
            "Deal name": "Consulting firm",
            "Deal Stage": "Won",
            Priority: "Medium",
            Company: "Vertex Consulting Group",
          },
        ],
      }
    ),
  },

  {
    name: "Fundraising Tracker",
    description: "Keep all information about potential investors in one place.",
    category: "sales",
    pageSnapshot: dbSnap(
      "Fundraising Tracker",
      '{"type":"icon","name":"BarChart2","color":"#f59e0b"}',
      "Keep all information about potential investors in one place.",
      {
        properties: [
          { name: "Investor name", type: "title" },
          {
            name: "Status",
            type: "select",
            options: [
              { name: "Not started", color: "gray" },
              { name: "Diligence", color: "blue" },
              { name: "Pitched", color: "orange" },
              { name: "Won", color: "green" },
              { name: "Lost", color: "red" },
            ],
          },
          { name: "Email", type: "email" },
          { name: "Contact", type: "person" },
          { name: "Fund size", type: "text" },
          { name: "Notes", type: "text" },
        ],
        views: [
          {
            name: "By Status",
            type: "board",
            isDefault: true,
            groupBy: "Status",
          },
          { name: "All Investors", type: "table" },
          {
            name: "Won",
            type: "table",
            filterKey: "Status",
            filterValue: "Won",
          },
        ],
        sample_rows: [
          {
            "Investor name": "VC firm 1",
            Status: "Won",
            Email: "contact@vcfirm1.com",
            "Fund size": "$150M",
            Notes:
              "Led our Series A round; strong follow-on interest for future rounds.",
          },
          {
            "Investor name": "VC firm 2",
            Status: "Pitched",
            Email: "contact@vcfirm2.com",
            "Fund size": "$80M",
            Notes: "Pitched last week; awaiting partner meeting feedback.",
          },
          {
            "Investor name": "VC firm 3",
            Status: "Lost",
            Email: "contact@vcfirm3.com",
            "Fund size": "$200M",
            Notes:
              "Passed — said timing wasn't right for their fund's focus areas.",
          },
        ],
      }
    ),
  },
];
