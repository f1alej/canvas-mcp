import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getCanvasClient } from '../canvas-client.js';

export function registerSearchTools(server: McpServer) {
  const client = getCanvasClient();

  // Find assignments by due date range
  server.tool(
    'find_assignments_by_due_date',
    {
      course_id: z.number().describe('The Canvas course ID'),
      start_date: z.string().describe('Start date (ISO 8601 format, e.g., 2024-01-01)'),
      end_date: z.string().describe('End date (ISO 8601 format, e.g., 2024-01-31)'),
    },
    async ({ course_id, start_date, end_date }) => {
      try {
        const startDateObj = new Date(start_date);
        const endDateObj = new Date(end_date);

        if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
          return {
            content: [{
              type: 'text',
              text: 'Error: Invalid date format. Please use ISO 8601 format (e.g., 2024-01-01)',
            }],
            isError: true,
          };
        }

        const assignments = await client.getAssignmentsByDateRange(
          course_id,
          startDateObj,
          endDateObj
        );

        const formattedAssignments = assignments.map(a => ({
          id: a.id,
          name: a.name,
          due_at: a.due_at,
          points_possible: a.points_possible,
          submission_types: a.submission_types,
          has_submitted: a.submission?.workflow_state === 'submitted' || a.submission?.workflow_state === 'graded',
          html_url: a.html_url,
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              date_range: { start: start_date, end: end_date },
              count: formattedAssignments.length,
              assignments: formattedAssignments,
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error finding assignments: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  // Get upcoming assignments (due within specified days)
  server.tool(
    'get_upcoming_assignments',
    {
      course_id: z.number().describe('The Canvas course ID'),
      days_ahead: z.number().optional().default(7)
        .describe('Number of days to look ahead (default: 7)'),
    },
    async ({ course_id, days_ahead }) => {
      try {
        const assignments = await client.getUpcomingAssignments(course_id, days_ahead);

        const formattedAssignments = assignments.map(a => ({
          id: a.id,
          name: a.name,
          due_at: a.due_at,
          points_possible: a.points_possible,
          submission_types: a.submission_types,
          has_submitted: a.submission?.workflow_state === 'submitted' || a.submission?.workflow_state === 'graded',
          days_until_due: a.due_at ? Math.ceil((new Date(a.due_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null,
          html_url: a.html_url,
        }));

        // Sort by due date
        formattedAssignments.sort((a, b) => {
          if (!a.due_at) return 1;
          if (!b.due_at) return -1;
          return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              looking_ahead_days: days_ahead,
              count: formattedAssignments.length,
              assignments: formattedAssignments,
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error getting upcoming assignments: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  // Get overdue assignments
  server.tool(
    'get_overdue_assignments',
    {
      course_id: z.number().describe('The Canvas course ID'),
    },
    async ({ course_id }) => {
      try {
        const assignments = await client.getOverdueAssignments(course_id);

        const formattedAssignments = assignments.map(a => ({
          id: a.id,
          name: a.name,
          due_at: a.due_at,
          points_possible: a.points_possible,
          submission_types: a.submission_types,
          days_overdue: a.due_at ? Math.floor((Date.now() - new Date(a.due_at).getTime()) / (1000 * 60 * 60 * 24)) : null,
          html_url: a.html_url,
        }));

        // Sort by how overdue (most overdue first)
        formattedAssignments.sort((a, b) => (b.days_overdue || 0) - (a.days_overdue || 0));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: formattedAssignments.length,
              assignments: formattedAssignments,
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error getting overdue assignments: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  // Search course content (modules and assignments)
  server.tool(
    'search_course_content',
    {
      course_id: z.number().describe('The Canvas course ID'),
      search_term: z.string().describe('Search term to find in modules and assignments'),
    },
    async ({ course_id, search_term }) => {
      try {
        const results = await client.searchCourseContent(course_id, search_term);

        const formattedResults = {
          search_term,
          modules: results.modules.map(mod => ({
            id: mod.id,
            name: mod.name,
            items: mod.items?.filter(item => 
              item.title.toLowerCase().includes(search_term.toLowerCase())
            ).map(item => ({
              id: item.id,
              title: item.title,
              type: item.type,
              html_url: item.html_url,
            })),
          })).filter(mod => mod.items && mod.items.length > 0),
          assignments: results.assignments.map(a => ({
            id: a.id,
            name: a.name,
            due_at: a.due_at,
            points_possible: a.points_possible,
            html_url: a.html_url,
          })),
        };

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(formattedResults, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error searching course content: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  // Get all assignments across multiple courses (useful for students with many classes)
  server.tool(
    'get_all_upcoming_work',
    {
      days_ahead: z.number().optional().default(7)
        .describe('Number of days to look ahead (default: 7)'),
    },
    async ({ days_ahead }) => {
      try {
        // First get all active courses
        const courses = await client.listCourses({
          enrollment_state: 'active',
          state: ['available'],
        });

        // Collect assignments from all courses
        const allAssignments: Array<{
          course_id: number;
          course_name: string;
          assignment: {
            id: number;
            name: string;
            due_at: string | null;
            points_possible: number;
            submission_types: string[];
            has_submitted: boolean;
            days_until_due: number | null;
            html_url: string;
          };
        }> = [];

        for (const course of courses) {
          try {
            const assignments = await client.getUpcomingAssignments(course.id, days_ahead);
            
            for (const a of assignments) {
              allAssignments.push({
                course_id: course.id,
                course_name: course.name,
                assignment: {
                  id: a.id,
                  name: a.name,
                  due_at: a.due_at,
                  points_possible: a.points_possible,
                  submission_types: a.submission_types,
                  has_submitted: a.submission?.workflow_state === 'submitted' || a.submission?.workflow_state === 'graded',
                  days_until_due: a.due_at ? Math.ceil((new Date(a.due_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null,
                  html_url: a.html_url,
                },
              });
            }
          } catch {
            // Skip courses where we can't fetch assignments
            continue;
          }
        }

        // Sort by due date
        allAssignments.sort((a, b) => {
          if (!a.assignment.due_at) return 1;
          if (!b.assignment.due_at) return -1;
          return new Date(a.assignment.due_at).getTime() - new Date(b.assignment.due_at).getTime();
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              looking_ahead_days: days_ahead,
              total_count: allAssignments.length,
              courses_checked: courses.length,
              assignments: allAssignments,
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error getting upcoming work: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  );
}
