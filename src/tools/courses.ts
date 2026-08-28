import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getCanvasClient } from '../canvas-client.js';

export function registerCourseTools(server: McpServer) {
  const client = getCanvasClient();

  // List all courses for the authenticated user
  server.tool(
    'list_courses',
    {
      enrollment_type: z.enum(['teacher', 'student', 'ta', 'observer', 'designer']).optional()
        .describe('Filter by enrollment type'),
      enrollment_state: z.enum(['active', 'invited_or_pending', 'completed']).optional()
        .describe('Filter by enrollment state'),
      include_syllabus: z.boolean().optional().default(false)
        .describe('Include syllabus body in response'),
    },
    async ({ enrollment_type, enrollment_state, include_syllabus }) => {
      try {
        const include: string[] = ['term', 'total_students'];
        if (include_syllabus) {
          include.push('syllabus_body');
        }

        const courses = await client.listCourses({
          enrollment_type,
          enrollment_state,
          include: include as ('term' | 'total_students' | 'syllabus_body')[],
          state: ['available'],
        });

        const formattedCourses = courses.map(course => ({
          id: course.id,
          name: course.name,
          course_code: course.course_code,
          term: course.term?.name,
          total_students: course.total_students,
          start_date: course.start_at,
          end_date: course.end_at,
          default_view: course.default_view,
          syllabus: include_syllabus ? course.syllabus_body : undefined,
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(formattedCourses, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error listing courses: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  // Get details for a specific course
  server.tool(
    'get_course',
    {
      course_id: z.number().describe('The Canvas course ID'),
      include_syllabus: z.boolean().optional().default(true)
        .describe('Include syllabus body in response'),
    },
    async ({ course_id, include_syllabus }) => {
      try {
        const include = ['term', 'total_students', 'course_progress'];
        if (include_syllabus) {
          include.push('syllabus_body');
        }

        const course = await client.getCourse(course_id, include);

        const formattedCourse = {
          id: course.id,
          name: course.name,
          course_code: course.course_code,
          term: course.term?.name,
          total_students: course.total_students,
          start_date: course.start_at,
          end_date: course.end_at,
          time_zone: course.time_zone,
          default_view: course.default_view,
          public_description: course.public_description,
          syllabus: course.syllabus_body,
        };

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(formattedCourse, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error getting course: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  );
}
