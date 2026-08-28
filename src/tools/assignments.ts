import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getCanvasClient } from '../canvas-client.js';

export function registerAssignmentTools(server: McpServer) {
  const client = getCanvasClient();

  // List assignments for a course
  server.tool(
    'list_assignments',
    {
      course_id: z.number().describe('The Canvas course ID'),
      bucket: z.enum(['past', 'overdue', 'undated', 'ungraded', 'unsubmitted', 'upcoming', 'future']).optional()
        .describe('Filter assignments by status/time bucket'),
      order_by: z.enum(['position', 'name', 'due_at']).optional()
        .describe('Order results by field'),
      include_submission: z.boolean().optional().default(true)
        .describe('Include current user submission status'),
    },
    async ({ course_id, bucket, order_by, include_submission }) => {
      try {
        const include: string[] = [];
        if (include_submission) {
          include.push('submission');
        }

        const assignments = await client.listAssignments(course_id, {
          bucket,
          order_by,
          include: include as ('submission')[],
        });

        const formattedAssignments = assignments.map(a => ({
          id: a.id,
          name: a.name,
          due_at: a.due_at,
          points_possible: a.points_possible,
          submission_types: a.submission_types,
          published: a.published,
          locked_for_user: a.locked_for_user,
          has_submitted: a.submission?.workflow_state === 'submitted' || a.submission?.workflow_state === 'graded',
          submission_status: a.submission?.workflow_state,
          grade: a.submission?.grade,
          score: a.submission?.score,
          html_url: a.html_url,
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(formattedAssignments, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error listing assignments: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  // Get detailed information about a specific assignment
  server.tool(
    'get_assignment',
    {
      course_id: z.number().describe('The Canvas course ID'),
      assignment_id: z.number().describe('The assignment ID'),
      include_rubric: z.boolean().optional().default(true)
        .describe('Include rubric criteria if available'),
    },
    async ({ course_id, assignment_id, include_rubric }) => {
      try {
        const include = ['submission'];
        
        const assignment = await client.getAssignment(course_id, assignment_id, include);

        const result: Record<string, unknown> = {
          id: assignment.id,
          name: assignment.name,
          description: assignment.description,
          due_at: assignment.due_at,
          unlock_at: assignment.unlock_at,
          lock_at: assignment.lock_at,
          points_possible: assignment.points_possible,
          grading_type: assignment.grading_type,
          submission_types: assignment.submission_types,
          allowed_extensions: assignment.allowed_extensions,
          allowed_attempts: assignment.allowed_attempts,
          published: assignment.published,
          locked_for_user: assignment.locked_for_user,
          lock_explanation: assignment.lock_explanation,
          html_url: assignment.html_url,
          submission: assignment.submission ? {
            workflow_state: assignment.submission.workflow_state,
            submitted_at: assignment.submission.submitted_at,
            attempt: assignment.submission.attempt,
            grade: assignment.submission.grade,
            score: assignment.submission.score,
            late: assignment.submission.late,
            missing: assignment.submission.missing,
            excused: assignment.submission.excused,
          } : null,
        };

        if (include_rubric && assignment.rubric) {
          result.rubric = {
            settings: assignment.rubric_settings,
            use_for_grading: assignment.use_rubric_for_grading,
            criteria: assignment.rubric.map(criterion => ({
              id: criterion.id,
              description: criterion.description,
              long_description: criterion.long_description,
              points: criterion.points,
              ratings: criterion.ratings.map(rating => ({
                description: rating.description,
                long_description: rating.long_description,
                points: rating.points,
              })),
            })),
          };
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error getting assignment: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  // Get rubric for an assignment
  server.tool(
    'get_rubric',
    {
      course_id: z.number().describe('The Canvas course ID'),
      assignment_id: z.number().describe('The assignment ID to get rubric for'),
    },
    async ({ course_id, assignment_id }) => {
      try {
        const assignment = await client.getAssignment(course_id, assignment_id);

        if (!assignment.rubric) {
          return {
            content: [{
              type: 'text',
              text: 'This assignment does not have a rubric.',
            }],
          };
        }

        const rubricInfo = {
          settings: assignment.rubric_settings,
          use_for_grading: assignment.use_rubric_for_grading,
          total_points: assignment.rubric_settings?.points_possible,
          criteria: assignment.rubric.map(criterion => ({
            id: criterion.id,
            description: criterion.description,
            long_description: criterion.long_description,
            points: criterion.points,
            ratings: criterion.ratings.map(rating => ({
              description: rating.description,
              long_description: rating.long_description,
              points: rating.points,
            })),
          })),
        };

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(rubricInfo, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error getting rubric: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  );
}
