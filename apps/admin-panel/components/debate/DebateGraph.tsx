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
  MarkerType,
} from '@xyflow/react';
import { useEffect, useMemo, useCallback } from 'react';

import { AgentNode, type AgentNodeData } from './AgentNode';
import { ChallengeEdge } from './ChallengeEdge';
import type { AgentId, AgentStatus, Challenge, Rebuttal } from './debate.types';

const nodeTypes = { agentNode: AgentNode };
const edgeTypes = { challengeEdge: ChallengeEdge };
const PRO_OPTIONS = { hideAttribution: true };
const DEFAULT_VIEWPORT = { x: 0, y: 0, zoom: 1 };

const AGENT_CONFIG: { id: AgentId; label: string; x: number; y: number }[] = [  
  { id: 'build_analyzer', label: 'Build Analyzer', x: 100, y: 350 },
  { id: 'code_reviewer', label: 'Code Reviewer', x: 450, y: 150 },
  { id: 'test_analyzer', label: 'Test Analyzer', x: 450, y: 550 },
  { id: 'dependency_checker', label: 'Dependency Checker', x: 800, y: 350 },
  { id: 'judge', label: 'Judge', x: 1200, y: 350 },
];

interface Props {
  statuses: Record<AgentId, AgentStatus>;
  confidences: Partial<Record<AgentId, number>>;
  challenges: Challenge[];
  rebuttals: Partial<Record<AgentId, Rebuttal>>;
  onHoverNode?: (id: AgentId | null) => void;
}

export function DebateGraph({ statuses, confidences, challenges, rebuttals, onHoverNode }: Props) {
  const derivedNodes: Node[] = useMemo(
    () =>
      AGENT_CONFIG.map((a) => ({
        id: a.id,
        type: 'agentNode',
        draggable: true,
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
      challenges.map((challenge) => {
        const rebuttal = rebuttals[challenge.targetAgentId];
        const isResolved = Boolean(rebuttal);
        const position = rebuttal?.position;
        const color = isResolved 
            ? (position === 'DEFEND' ? '#3b82f6' : '#ef4444') 
            : '#f59e0b';
            
        return {
            id: challenge.challengeId,
            source: challenge.challengerAgentId,
            target: challenge.targetAgentId,
            type: 'challengeEdge',
            selectable: false,
            animated: true,
            markerEnd: {
                type: MarkerType.ArrowClosed,
                color: color,
            },
            data: {
                label: isResolved ? `Round 1 Challenge / Round 2 ${position}` : 'Round 1 Challenge',      
                resolved: isResolved,
                position: position,
            },
        };
      }),
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
          position: existing ? existing.position : dn.position,
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

  const onNodeMouseEnter = useCallback((_: React.MouseEvent, node: Node) => {
    onHoverNode?.(node.id as AgentId);
  }, [onHoverNode]);

  const onPaneMouseEnter = useCallback(() => {
    onHoverNode?.(null);
  }, [onHoverNode]);

  return (
    <div className="h-full w-full bg-[#0A0A0A]">  
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeMouseEnter={onNodeMouseEnter}
        onPaneClick={onPaneMouseEnter}
        onPaneMouseEnter={onPaneMouseEnter}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultViewport={DEFAULT_VIEWPORT}
        minZoom={0.5}
        maxZoom={2}
        panOnDrag={true}
        zoomOnPinch={true}
        zoomOnScroll={true}
        zoomOnDoubleClick={true}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        proOptions={PRO_OPTIONS}
        className="bg-transparent"
        fitView
        fitViewOptions={{ padding: 0.2 }}
      >
        <Background
          color="rgba(103, 133, 160, 0.08)"
          gap={24}
          variant={BackgroundVariant.Dots}
          size={1.5}
        />
      </ReactFlow>
    </div>
  );
}
