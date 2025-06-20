'use client'

import type { TableGroup } from '@liam-hq/db-structure'
import { boolean, object, optional, parse, string } from 'valibot'
import { ERROR_MESSAGES } from '../constants/chatConstants'
import type { TimelineItemEntry } from '../types/chatTypes'
import { formatTimelineItemHistory } from './timelineItemHelpers'

type DesignSession = {
  id: string
  organizationId: string
  buildingSchemaId: string
  latestVersionNumber?: number
}

interface SendChatMessageParams {
  message: string
  tableGroups?: Record<string, TableGroup>
  timelineItems: TimelineItemEntry[]
  designSession: DesignSession
  setProgressMessages: (updater: (prev: string[]) => string[]) => void
  currentUserId: string
}

interface SendChatMessageResult {
  success: boolean
  error?: string
}

/**
 * Schema for API response validation
 */
const ChatAPIResponseSchema = object({
  success: optional(boolean()),
  text: optional(string()),
  error: optional(string()),
})

/**
 * Calls the /api/chat endpoint with the given parameters
 */
const callChatAPI = async (
  message: string,
  tableGroups: Record<string, TableGroup> | undefined,
  history: [string, string][],
  designSession: DesignSession,
  currentUserId: string,
): Promise<Response> => {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      tableGroups,
      history,
      organizationId: designSession.organizationId,
      buildingSchemaId: designSession.buildingSchemaId,
      latestVersionNumber: designSession.latestVersionNumber || 0,
      designSessionId: designSession.id,
      userId: currentUserId,
    }),
  })

  if (!response.ok) {
    throw new Error(ERROR_MESSAGES.FETCH_FAILED)
  }

  return response
}

/**
 * Handles errors by clearing progress messages
 */
const handleChatError = (
  error: unknown,
  setProgressMessages: (updater: (prev: string[]) => string[]) => void,
): SendChatMessageResult => {
  console.error('Error in sendChatMessage:', error)

  // Clear progress messages on error
  setProgressMessages(() => [])

  return {
    success: false,
    error: error instanceof Error ? error.message : ERROR_MESSAGES.GENERAL,
  }
}

/**
 * Sends a chat message to the API endpoint and handles the response
 * Messages are saved server-side and received via Supabase Realtime
 */
export const sendChatMessage = async ({
  message,
  tableGroups,
  timelineItems,
  designSession,
  setProgressMessages,
  currentUserId,
}: SendChatMessageParams): Promise<SendChatMessageResult> => {
  try {
    // Format timeline item history for API
    const history = formatTimelineItemHistory(timelineItems)

    // Call API
    const response = await callChatAPI(
      message,
      tableGroups,
      history,
      designSession,
      currentUserId,
    )

    // Parse JSON response with type safety
    const rawData = await response.json()
    const data = parse(ChatAPIResponseSchema, rawData)

    if (!data.success) {
      throw new Error(data.error || ERROR_MESSAGES.GENERAL)
    }

    // Clear progress messages on success
    setProgressMessages(() => [])

    return { success: true }
  } catch (error) {
    return handleChatError(error, setProgressMessages)
  }
}
