'use client';

import {
  Background,
  BackgroundVariant,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  Position,
} from '@xyflow/react';
import { useEffect, useMemo, useCallback } from 'react';

import { AgentNode, type AgentNodeData } from './AgentNode';
import { ChallengeEdge } from './ChallengeEdge';
import type { AgentId, AgentStatus, Challenge, Rebuttal } from './debate.types';

const nodeTypes = { agentNode: AgentNode };
const edgeTypes = { challengeEdge: ChallengeEdge };
const PRO_OPTIONS = { hideAttribution: true };
const DEFAULT_VIEWPORT = { x: -10, y: -10, zoom: 0.9 };

const AGENT_CONFIG: { id: AgentId; label: string; x: number; y: number }[] = [
  { id: 'build_analyzer', label: 'Build Analyzer', x: 30, y: 118 },
  { id: 'code_reviewer', label: 'Code Reviewer', x: 250, y: 12 },
  { id: 'test_analyzer', label: 'Test Analyzer', x: 250, y: 224 },
  { id: 'dependency_checker', label: 'Dependency Checker', x: 500, y: 118 },
  { id: 'judge', label: 'Judge', x: 780, y: 118 },
];

interface Props {
  statuses: Record<AgentId, AgentStatus>;
  confidences: Partial<Record<AgentId, number>>;
  challenges: Challenge[];
  rebuttals: Partial<Record<AgentId, Rebuttal>>;
}

export function DebateGraph({ statuses, confidences, challenges, rebuttals }: Props) {
  const derivedNodes: Node[] = useMemo(
    () =>
      AGENT_CONFIG.map((a) => ({
        id: a.id,
        type: 'agentNode',
        draggable: false,
        selectable: true,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        position: { x: a.x, y: a.y },
        data: {
          agentId: a.id,
          label: a.label,
          status: statuses[a.id] ?? 'idle',
          confidence: confidences[a.id],
          rebuttalPosition: rebuttals[a.id]?.position,
        } satisfies AgentNodeData,
      })),
    [statuses, confidences, rebuttals],
  );

  const derivedEdges: Edge[] = useMemo(
    () =>
      challenges.map((challenge) => ({
        id: challenge.challengeId,
        source: challenge.challengerAgentId,
        target: challenge.targetAgentId,
        type: 'challengeEdge',
        selectable: false,
        animated: true,
        markerEnd: {
          type: 'arrowclosed',
          color: rebuttals[challenge.targetAgentId]?.position === 'DEFEND' ? '#3b82f6' : (rebuttals[challenge.targetAgentId] ? '#ef4444' : '#f59e0b'),
          width: 20,
          height: 20,
        },
        data: {
          label: rebuttals[challenge.targetAgentId] ? `Round 1 Challenge / Round 2 ${rebuttals[challenge.targetAgentId]!.position}` : 'Round 1 Challenge',
          resolved: Boolean(rebuttals[challenge.targetAgentId]),
          position: rebuttals[challenge.targetAgentId]?.position,
        },
      })),
    [challenges, rebuttals],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(derivedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(derivedEdges);

  useEffect(() => {
    setNodes((nds) =>
      derivedNodes.map((dn) => {
        const existing = nds.find((n) => n.id === dn.id);
        return {
          ...dn,
          measured: existing?.measured,
          width: existing?.width,
          height: existing?.height,
        };
      }),
    );
  }, [derivedNodes, setNodes]);

  useEffect(() => {
    setEdges(derivedEdges);
  }, [derivedEdges, setEdges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const el = document.getElementById(`finding-${node.id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  return (
    <div className="h-[360px] w-full overflow-hidden border-y border-white/5">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultViewport={DEFAULT_VIEWPORT}
        minZoom={0.9}
        maxZoom={0.9}
        panOnDrag={false}
        zoomOnPinch={false}
        zoomOnScroll={false}
        zoomOnDoubleClick={false}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        proOptions={PRO_OPTIONS}
        className="bg-transparent"
      >
        <Background
          color="rgba(103, 133, 160, 0.14)"
          gap={22}
          variant={BackgroundVariant.Dots}
          size={1.4}
        />
      </ReactFlow>
    </div>
  );
}
