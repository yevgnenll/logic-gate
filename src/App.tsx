import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

// --- 타입 정의 (TypeScript) ---
type BaseGateType = 'INPUT' | 'OUTPUT' | 'AND' | 'OR' | 'NOT';
type GateType = BaseGateType | 'CUSTOM';

interface Gate {
    id: string;
    type: GateType;
    position: { x: number; y: number };
    value: boolean; // For INPUT gates and internal simulation
    name?: string;
    // For CUSTOM gates
    customGateName?: string;
    inputValues?: boolean[];
    outputValues?: boolean[];
}

interface Wire {
    id: string;
    from: { gateId: string; portIndex: number };
    to: { gateId: string; portIndex: number };
}

interface AppState {
    gates: Gate[];
    wires: Wire[];
}

interface CustomGateTemplate {
    name: string;
    gates: Omit<Gate, 'value'>[];
    wires: Omit<Wire, 'id'>[];
    inputs: { originalId: string, name?: string }[];
    outputs: { originalId: string, name?: string }[];
}

interface ViewTransform {
    x: number;
    y: number;
    k: number; // zoom level
}

// --- 상수 정의 ---
const GATE_DIMENSIONS: Record<BaseGateType, { width: number; height: number; inputs: number; outputs: number; }> = {
    INPUT: { width: 100, height: 50, inputs: 0, outputs: 1 },
    OUTPUT: { width: 100, height: 50, inputs: 1, outputs: 0 },
    AND: { width: 80, height: 100, inputs: 2, outputs: 1 },
    OR: { width: 80, height: 100, inputs: 2, outputs: 1 },
    NOT: { width: 80, height: 60, inputs: 1, outputs: 1 },
};
const PORT_RADIUS = 8;
const CUSTOM_GATE_WIDTH = 150;

// --- 실행 취소/다시 실행을 위한 커스텀 훅 ---
const useHistory = (initialState: AppState) => {
    const [history, setHistory] = useState({
        past: [] as AppState[],
        present: initialState,
        future: [] as AppState[],
    });

    const setState = useCallback((newState: AppState | ((prevState: AppState) => AppState), fromDragEnd: boolean = false) => {
        setHistory(currentHistory => {
            const newPresent = typeof newState === 'function' ? newState(currentHistory.present) : newState;
            if (JSON.stringify(newPresent) === JSON.stringify(currentHistory.present)) {
                return currentHistory;
            }
            if (fromDragEnd) {
                return { ...currentHistory, present: newPresent };
            }
            return {
                past: [...currentHistory.past, currentHistory.present],
                present: newPresent,
                future: [],
            };
        });
    }, []);

    const setPresentState = useCallback((newState: AppState | ((prevState: AppState) => AppState)) => {
        setHistory(currentHistory => {
            const newPresent = typeof newState === 'function' ? newState(currentHistory.present) : newState;
            return {
                ...currentHistory,
                present: newPresent,
            };
        });
    }, []);

    const undo = useCallback(() => {
        setHistory(currentHistory => {
            if (currentHistory.past.length === 0) return currentHistory;
            const previous = currentHistory.past[currentHistory.past.length - 1];
            const newPast = currentHistory.past.slice(0, currentHistory.past.length - 1);
            return {
                past: newPast,
                present: previous,
                future: [currentHistory.present, ...currentHistory.future],
            };
        });
    }, []);

    const redo = useCallback(() => {
        setHistory(currentHistory => {
            if (currentHistory.future.length === 0) return currentHistory;
            const next = currentHistory.future[0];
            const newFuture = currentHistory.future.slice(1);
            return {
                past: [...currentHistory.past, currentHistory.present],
                present: next,
                future: newFuture,
            };
        });
    }, []);

    return { state: history.present, setState, setPresentState, undo, redo, canUndo: history.past.length > 0, canRedo: history.future.length > 0 };
};


// --- 헬퍼 함수 ---
const getPortPosition = (gate: Gate | Omit<Gate, 'value'>, type: 'input' | 'output', index: number, customGateDef?: CustomGateTemplate) => {
    const isCustom = gate.type === 'CUSTOM' && customGateDef;
    const dimensions = isCustom ? { width: CUSTOM_GATE_WIDTH, height: Math.max(customGateDef.inputs.length, customGateDef.outputs.length) * 40 + 20 } : GATE_DIMENSIONS[gate.type as BaseGateType];
    const portCount = isCustom
        ? (type === 'input' ? customGateDef.inputs.length : customGateDef.outputs.length)
        : (type === 'input' ? GATE_DIMENSIONS[gate.type as BaseGateType].inputs : GATE_DIMENSIONS[gate.type as BaseGateType].outputs);

    if (portCount === 0) return {x:0, y:0};
    const spacing = dimensions.height / (portCount + 1);

    return {
        x: gate.position.x + (type === 'input' ? 0 : dimensions.width),
        y: gate.position.y + (index + 1) * spacing,
    };
};

// --- 컴포넌트 ---

const GateComponent = React.memo(({ gate, onDragStart, onDrag, onDragEnd, onPortClick, onPortDoubleClick, onClick, isSelected, customGateDef, isReadOnly }: {
    gate: Gate;
    onDragStart: (gateId: string, e: React.MouseEvent) => void;
    onDrag: (dragDelta: { dx: number; dy: number }) => void;
    onDragEnd: () => void;
    onPortClick: (gateId: string, portType: 'input' | 'output', portIndex: number) => void;
    onPortDoubleClick: (e: React.MouseEvent, gateId: string, portIndex: number) => void;
    onClick: (e: React.MouseEvent, gateId: string) => void;
    isSelected: boolean;
    customGateDef?: CustomGateTemplate;
    isReadOnly: boolean;
}) => {
    const isCustom = gate.type === 'CUSTOM';
    const dimensions = isCustom && customGateDef
        ? { width: CUSTOM_GATE_WIDTH, height: Math.max(customGateDef.inputs.length, customGateDef.outputs.length) * 40 + 20 }
        : GATE_DIMENSIONS[gate.type as BaseGateType];


    const handleMouseDown = (e: React.MouseEvent) => {
        if (isReadOnly) return;
        onDragStart(gate.id, e);
        const startPos = { x: e.clientX, y: e.clientY };

        const handleMouseMove = (moveE: MouseEvent) => {
            const dx = moveE.clientX - startPos.x;
            const dy = moveE.clientY - startPos.y;
            onDrag({ dx, dy });
        };

        const handleMouseUp = () => {
            onDragEnd();
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const renderPorts = (portType: 'input' | 'output') => {
        const count = isCustom && customGateDef
            ? (portType === 'input' ? customGateDef.inputs.length : customGateDef.outputs.length)
            : (portType === 'input' ? GATE_DIMENSIONS[gate.type as BaseGateType].inputs : GATE_DIMENSIONS[gate.type as BaseGateType].outputs);

        return Array.from({ length: count }).map((_, i) => {
            const pos = getPortPosition(gate, portType, i, customGateDef);
            const portValue = portType === 'input' ? gate.inputValues?.[i] : gate.outputValues?.[i];
            return (
                <g key={`${portType}-${i}`}>
                    <circle
                        cx={pos.x - gate.position.x}
                        cy={pos.y - gate.position.y}
                        r={PORT_RADIUS}
                        className={`transition-colors ${portValue ? 'fill-sky-400' : 'fill-gray-400'} pointer-events-none`}
                    />
                    <circle
                        cx={pos.x - gate.position.x}
                        cy={pos.y - gate.position.y}
                        r={PORT_RADIUS * 1.8}
                        className={`fill-transparent ${!isReadOnly && 'cursor-pointer'}`}
                        onClick={(e) => { if (!isReadOnly) { e.stopPropagation(); onPortClick(gate.id, portType, i); } }}
                        onDoubleClick={(e) => { if (!isReadOnly && portType === 'input') { e.stopPropagation(); onPortDoubleClick(e, gate.id, i); }}}
                    />
                </g>
            );
        });
    };

    const gateBodyStyle = `stroke-2 transition-colors duration-300 ${isSelected ? 'stroke-yellow-400' : 'stroke-gray-400'}`;
    const fillStyle = gate.value ? 'fill-sky-400' : 'fill-gray-700';

    return (
        <g transform={`translate(${gate.position.x}, ${gate.position.y})`} onMouseDown={handleMouseDown} onClick={(e) => onClick(e, gate.id)} className={`gate-component-group ${!isReadOnly ? 'cursor-move select-none' : 'select-none'}`}>
            {gate.type === 'CUSTOM' && (
                <rect width={dimensions.width} height={dimensions.height} rx="10" className={`${fillStyle} ${gateBodyStyle}`} />
            )}
            {gate.type === 'AND' && ( <path d={`M0,0 L0,${dimensions.height} L${dimensions.width/2},${dimensions.height} A${dimensions.width/2},${dimensions.height/2} 0 0 0 ${dimensions.width/2},0 L0,0 Z`} className={`${fillStyle} ${gateBodyStyle}`} /> )}
            {gate.type === 'OR' && ( <path d={`M0,0 Q${dimensions.width/2},${dimensions.height/2} 0,${dimensions.height} L${dimensions.width*0.7},${dimensions.height} A${dimensions.width*0.7},${dimensions.height/2} 0 0 0 ${dimensions.width*0.7},0 L0,0 Z`} className={`${fillStyle} ${gateBodyStyle}`} /> )}
            {gate.type === 'NOT' && ( <> <path d={`M0,0 L${dimensions.width - PORT_RADIUS},${dimensions.height/2} L0,${dimensions.height} Z`} className={`${fillStyle} ${gateBodyStyle}`} /> <circle cx={dimensions.width} cy={dimensions.height/2} r={PORT_RADIUS} className={`${fillStyle} ${gateBodyStyle}`} /> </> )}
            {(gate.type === 'INPUT' || gate.type === 'OUTPUT') && ( <rect width={dimensions.width} height={dimensions.height} rx="10" className={`${fillStyle} ${gateBodyStyle}`} /> )}

            <text x={dimensions.width / 2} y={dimensions.height / 2 + 5} textAnchor="middle" className="fill-white font-bold text-sm pointer-events-none">
                {gate.type === 'INPUT' ? (gate.value ? 'ON' : 'OFF') : gate.name || gate.type}
            </text>

            {renderPorts('input')}
            {renderPorts('output')}
        </g>
    );
});

const WireComponent = React.memo(({ wire, gates, customGates, value }: { wire: Wire; gates: Gate[]; customGates: {[name:string]: CustomGateTemplate}; value: boolean }) => {
    const fromGate = gates.find(g => g.id === wire.from.gateId);
    const toGate = gates.find(g => g.id === wire.to.gateId);

    if (!fromGate || !toGate) return null;

    const fromDef = fromGate.type === 'CUSTOM' ? customGates[fromGate.customGateName!] : undefined;
    const toDef = toGate.type === 'CUSTOM' ? customGates[toGate.customGateName!] : undefined;

    const startPos = getPortPosition(fromGate, 'output', wire.from.portIndex, fromDef);
    const endPos = getPortPosition(toGate, 'input', wire.to.portIndex, toDef);

    const pathData = `M${startPos.x},${startPos.y} C${startPos.x + 50},${startPos.y} ${endPos.x - 50},${endPos.y} ${endPos.x},${endPos.y}`;

    return (
        <path
            d={pathData}
            strokeWidth="4"
            fill="none"
            className={`transition-all duration-300 ${value ? 'stroke-sky-400' : 'stroke-gray-500'}`}
        />
    );
});

export default function App() {
    const [isReadOnly, setIsReadOnly] = useState(false);
    const { state, setState, setPresentState, undo, redo, canUndo, canRedo } = useHistory({ gates: [], wires: [] });

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const viewData = urlParams.get('view');
        if (viewData) {
            try {
                const decoded = JSON.parse(atob(viewData));
                setState(decoded, true);
                setIsReadOnly(true);
            } catch (e) {
                console.error("Failed to parse view data from URL", e);
                setState({
                    gates: [
                        { id: 'input1', type: 'INPUT', position: { x: 50, y: 50 }, value: false, name: 'A' },
                        { id: 'output1', type: 'OUTPUT', position: { x: 300, y: 50 }, value: false, name: 'Result' },
                    ],
                    wires: []
                }, true);
            }
        } else {
            setState({
                gates: [
                    { id: 'input1', type: 'INPUT', position: { x: 50, y: 50 }, value: false, name: 'A' },
                    { id: 'input2', type: 'INPUT', position: { x: 50, y: 200 }, value: false, name: 'B' },
                    { id: 'output1', type: 'OUTPUT', position: { x: 600, y: 125 }, value: false, name: 'Result' },
                ],
                wires: [],
            }, true);
        }
    }, []); // This effect runs only once on mount


    const { gates, wires } = state;
    const dragInfoRef = useRef<{startPositions: Map<string, {x:number, y:number}>, dragIds: string[], hasDragged: boolean} | null>(null);
    const selectionStartPoint = useRef<{x: number, y: number} | null>(null);
    const panStartRef = useRef<{x: number, y: number} | null>(null);
    const svgRef = useRef<SVGSVGElement>(null);

    const [connecting, setConnecting] = useState<{ from: { gateId: string; portIndex: number }; mousePos: { x: number; y: number } } | null>(null);
    const [selectedGateIds, setSelectedGateIds] = useState<string[]>([]);
    const [customGateName, setCustomGateName] = useState("");
    const [customGates, setCustomGates] = useState<{ [name: string]: CustomGateTemplate }>(() => {
        if (new URLSearchParams(window.location.search).get('view')) return {};
        try {
            const saved = localStorage.getItem('customLogicGates');
            return saved ? JSON.parse(saved) : {};
        } catch (error) {
            console.error("Failed to load custom gates", error);
            return {};
        }
    });
    const [selectionBox, setSelectionBox] = useState<{x: number, y: number, width: number, height: number} | null>(null);
    const [viewTransform, setViewTransform] = useState<ViewTransform>({ x: 0, y: 0, k: 1 });
    const [isPanning, setIsPanning] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);
    const [embedCode, setEmbedCode] = useState("");

    useEffect(() => { if(!isReadOnly) { try { localStorage.setItem('customLogicGates', JSON.stringify(customGates)); } catch (error) { console.error("Failed to save custom gates", error); } } }, [customGates, isReadOnly]);

    const addGate = (type: BaseGateType) => {
        let initialX = (250 - viewTransform.x) / viewTransform.k;
        let initialY = (150 - viewTransform.y) / viewTransform.k;

        while (gates.some(g => g.position.x === initialX && g.position.y === initialY)) {
            initialX += 20;
            initialY += 20;
        }

        const newGate: Gate = { id: `${type}-${Date.now()}`, type, position: { x: initialX, y: initialY }, value: false, };
        setState(s => ({...s, gates: [...s.gates, newGate]}));
    };

    const handleGateDragStart = useCallback((gateId: string) => {
        selectionStartPoint.current = null; // Prevent selection box from appearing
        const dragIds = selectedGateIds.includes(gateId) ? selectedGateIds : [gateId];
        const startPositions = new Map<string, {x:number, y:number}>();
        gates.forEach(g => {
            if (dragIds.includes(g.id)) {
                startPositions.set(g.id, g.position);
            }
        });
        dragInfoRef.current = { startPositions, dragIds, hasDragged: false };
    }, [selectedGateIds, gates]);

    const handleGateDrag = useCallback((dragDelta: { dx: number; dy: number }) => {
        if (!dragInfoRef.current) return;
        if (!dragInfoRef.current.hasDragged && (Math.abs(dragDelta.dx) > 3 || Math.abs(dragDelta.dy) > 3)) {
            dragInfoRef.current.hasDragged = true;
        }
        const { startPositions, dragIds } = dragInfoRef.current;
        setPresentState(s => ({
            ...s,
            gates: s.gates.map(gate => {
                if (dragIds.includes(gate.id)) {
                    const startPos = startPositions.get(gate.id)!;
                    return { ...gate, position: { x: startPos.x + dragDelta.dx / viewTransform.k, y: startPos.y + dragDelta.dy / viewTransform.k } };
                }
                return gate;
            })
        }));
    }, [setPresentState, viewTransform.k]);

    const handleGateDragEnd = useCallback(() => {
        if (dragInfoRef.current?.hasDragged) {
            setState(s => ({...s}), true); // Record history after drag ends
        }
        setTimeout(() => {
            dragInfoRef.current = null;
        }, 0);
    }, [setState]);

    const handleInputToggle = useCallback((id: string) => { setState(s => ({ ...s, gates: s.gates.map(g => (g.id === id && g.type === 'INPUT') ? { ...g, value: !g.value } : g) })); }, [setState]);
    const handlePortClick = useCallback((gateId: string, portType: 'input' | 'output', portIndex: number) => {
        if (portType === 'output') {
            const gate = gates.find(g => g.id === gateId);
            if(!gate) return;
            const gateDef = gate.type === 'CUSTOM' ? customGates[gate.customGateName!] : undefined;
            const startPos = getPortPosition(gate, 'output', portIndex, gateDef);
            setConnecting({ from: { gateId, portIndex }, mousePos: startPos });
        } else if (connecting) {
            if (wires.find(w => w.to.gateId === gateId && w.to.portIndex === portIndex)) return;
            const newWire: Wire = { id: `wire-${Date.now()}`, from: connecting.from, to: { gateId, portIndex } };
            setState(s => ({...s, wires: [...s.wires, newWire]}));
            setConnecting(null);
        }
    }, [connecting, gates, wires, setState, customGates]);

    const handlePortDoubleClick = useCallback((e: React.MouseEvent, gateId: string, portIndex: number) => {
        const wireToDisconnect = wires.find(w => w.to.gateId === gateId && w.to.portIndex === portIndex);
        if (wireToDisconnect) {
            setState(s => ({...s, wires: s.wires.filter(w => w.id !== wireToDisconnect.id)}));
            const {x, y} = getSvgCoordinates(e, (e.currentTarget as SVGSVGElement));
            setConnecting({ from: wireToDisconnect.from, mousePos: { x, y } });
        }
    }, [wires, setState]);

    const getSvgCoordinates = (e: React.MouseEvent | MouseEvent, svg: SVGSVGElement) => {
        if (svg) {
            const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
            return pt.matrixTransform(svg.getScreenCTM()?.inverse());
        }
        return {x: 0, y: 0};
    };

    const getWorldCoordinates = (e: React.MouseEvent | MouseEvent, svg: SVGSVGElement) => {
        const { x: svgX, y: svgY } = getSvgCoordinates(e, svg);
        return {
            x: (svgX - viewTransform.x) / viewTransform.k,
            y: (svgY - viewTransform.y) / viewTransform.k
        };
    };

    const handleCanvasMouseDown = (e: React.MouseEvent) => {
        if ((e.target as Element).closest('.gate-component-group')) return;

        if (e.button === 1) { // Middle mouse button for panning
            setIsPanning(true);
            panStartRef.current = { x: e.clientX, y: e.clientY };
            e.preventDefault();
            return;
        }
        if (isReadOnly) return;
        setConnecting(null);
        if(!e.shiftKey) {
            setSelectedGateIds([]);
        }
        selectionStartPoint.current = getWorldCoordinates(e, e.currentTarget as SVGSVGElement);
    };

    const handleCanvasMouseMove = (e: React.MouseEvent) => {
        const svg = e.currentTarget as SVGSVGElement;
        if (isPanning && panStartRef.current) {
            const dx = e.clientX - panStartRef.current.x;
            const dy = e.clientY - panStartRef.current.y;
            setViewTransform(v => ({ ...v, x: v.x + dx, y: v.y + dy }));
            panStartRef.current = { x: e.clientX, y: e.clientY };
            return;
        }
        if(connecting) {
            const { x, y } = getWorldCoordinates(e, svg);
            setConnecting(c => c ? { ...c, mousePos: { x, y } } : null);
            return;
        }
        if (!selectionStartPoint.current) return;
        const currentPoint = getWorldCoordinates(e, svg);
        const startPoint = selectionStartPoint.current;
        const x = Math.min(startPoint.x, currentPoint.x);
        const y = Math.min(startPoint.y, currentPoint.y);
        const width = Math.abs(startPoint.x - currentPoint.x);
        const height = Math.abs(startPoint.y - currentPoint.y);
        setSelectionBox({ x, y, width, height });
    };

    const handleCanvasMouseUp = () => {
        if (isPanning) {
            setIsPanning(false);
            panStartRef.current = null;
        }
        if (selectionBox) {
            const newlySelectedIds = gates.filter(gate => {
                const gateDef = gate.type === 'CUSTOM' ? customGates[gate.customGateName!] : undefined;
                const dimensions = gate.type === 'CUSTOM' && gateDef
                    ? { width: CUSTOM_GATE_WIDTH, height: Math.max(gateDef.inputs.length, gateDef.outputs.length) * 40 + 20 }
                    : GATE_DIMENSIONS[gate.type as BaseGateType];
                return (
                    gate.position.x < selectionBox.x + selectionBox.width &&
                    gate.position.x + dimensions.width > selectionBox.x &&
                    gate.position.y < selectionBox.y + selectionBox.height &&
                    gate.position.y + dimensions.height > selectionBox.y
                );
            }).map(g => g.id);
            setSelectedGateIds(prev => [...new Set([...prev, ...newlySelectedIds])]);
        }
        selectionStartPoint.current = null;
        setSelectionBox(null);
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const svg = e.currentTarget as SVGSVGElement;
        const { x: pointerX, y: pointerY } = getSvgCoordinates(e, svg);
        const zoomFactor = 1.1;
        const newK = e.deltaY < 0 ? viewTransform.k * zoomFactor : viewTransform.k / zoomFactor;
        const newX = pointerX - (pointerX - viewTransform.x) * (newK / viewTransform.k);
        const newY = pointerY - (pointerY - viewTransform.y) * (newK / viewTransform.k);
        setViewTransform({ x: newX, y: newY, k: newK });
    };

    const handleGateClick = (e: React.MouseEvent, gateId: string) => {
        if (dragInfoRef.current?.hasDragged) return;

        const gate = gates.find(g => g.id === gateId);
        if (!gate) return;

        if (gate.type === 'INPUT') {
            handleInputToggle(gateId);
        }

        if (isReadOnly) return;

        if (e.shiftKey) {
            setSelectedGateIds(prev => prev.includes(gateId) ? prev.filter(id => id !== gateId) : [...prev, gateId]);
        } else {
            setSelectedGateIds([gateId]);
        }
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isReadOnly) return;
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

            if (e.key === 'Escape') {
                if (connecting) {
                    setConnecting(null);
                }
            }

            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const modKey = isMac ? e.metaKey : e.ctrlKey;
            if (modKey && e.key === 'z') { e.preventDefault(); undo(); }
            else if (modKey && e.key === 'y') { e.preventDefault(); redo(); }
            else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedGateIds.length > 0) {
                setState(s => ({ gates: s.gates.filter(g => !selectedGateIds.includes(g.id)), wires: s.wires.filter(w => !selectedGateIds.includes(w.from.gateId) && !selectedGateIds.includes(w.to.gateId)) }));
                setSelectedGateIds([]);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedGateIds, setState, undo, redo, isReadOnly, connecting]);

    // Logic simulation
    useEffect(() => {
        let tempGates = gates.map(g => ({...g}));
        const runSimulation = (gateList: Gate[], wireList: Wire[]) => {
            let changed = false;
            let iterations = 0;
            const MAX_ITERATIONS = 50;
            let internalTempGates = gateList.map(g => ({...g}));

            do {
                changed = false;
                iterations++;
                internalTempGates = internalTempGates.map(g => {
                    if (g.type === 'INPUT') return g;
                    const inputWires = wireList.filter(w => w.to.gateId === g.id);
                    const gateDef = g.type === 'CUSTOM' ? customGates[g.customGateName!] : undefined;
                    const numInputs = g.type === 'CUSTOM' && gateDef ? gateDef.inputs.length : GATE_DIMENSIONS[g.type as BaseGateType].inputs;

                    if (g.type !== 'OUTPUT' && inputWires.length < numInputs) {
                        if (g.value !== false) { changed = true; return { ...g, value: false }; }
                        return g;
                    }
                    const inputValues = Array.from({length: numInputs}).map((_, i) => {
                        const wire = inputWires.find(w => w.to.portIndex === i);
                        if (!wire) return false;
                        const fromGate = internalTempGates.find(fg => fg.id === wire.from.gateId);
                        if (!fromGate) return false;
                        return fromGate.type === 'CUSTOM' ? (fromGate.outputValues?.[wire.from.portIndex] ?? false) : fromGate.value;
                    });

                    let newValue = false;
                    if (g.type === 'AND') { newValue = inputValues.every(v => v); }
                    else if (g.type === 'OR') { newValue = inputValues.some(v => v); }
                    else if (g.type === 'NOT') { newValue = inputValues.length > 0 ? !inputValues[0] : true; }
                    else if (g.type === 'OUTPUT') { newValue = inputValues[0] || false; }
                    if (g.value !== newValue) { changed = true; return { ...g, value: newValue }; }
                    return g;
                });
            } while (changed && iterations < MAX_ITERATIONS);
            return internalTempGates;
        };

        let changedInMainLoop = false;
        let mainIterations = 0;
        do {
            changedInMainLoop = false;
            mainIterations++;
            const nextTempGates = tempGates.map(g => {
                if (g.type !== 'CUSTOM') return g;
                const template = customGates[g.customGateName!];
                if (!template) return g;

                const newInputValues = template.inputs.map((_, i) => {
                    const wire = wires.find(w => w.to.gateId === g.id && w.to.portIndex === i);
                    if (!wire) return false;
                    const fromGate = tempGates.find(fg => fg.id === wire.from.gateId);
                    if (!fromGate) return false;
                    return fromGate.type === 'CUSTOM' ? (fromGate.outputValues?.[wire.from.portIndex] ?? false) : fromGate.value;
                });

                if (JSON.stringify(g.inputValues) !== JSON.stringify(newInputValues)) {
                    changedInMainLoop = true;
                }

                let internalGates = template.gates.map(tg => ({...tg, value:false, id: tg.id}));
                let internalWires = template.wires.map(tw => ({...tw, id: tw.from.gateId+tw.to.gateId}));

                template.inputs.forEach((inputDef, i) => {
                    const internalInputGate = internalGates.find(ig => ig.id === inputDef.originalId);
                    if (internalInputGate) internalInputGate.value = newInputValues[i];
                });

                const simulatedInternalGates = runSimulation(internalGates, internalWires);

                const newOutputValues = template.outputs.map(outputDef => {
                    const internalOutputGate = simulatedInternalGates.find(ig => ig.id === outputDef.originalId);
                    return internalOutputGate?.value ?? false;
                });

                if (JSON.stringify(g.outputValues) !== JSON.stringify(newOutputValues)) {
                    changedInMainLoop = true;
                }

                return {...g, inputValues: newInputValues, outputValues: newOutputValues};
            });
            tempGates = runSimulation(nextTempGates, wires);

        } while (changedInMainLoop && mainIterations < 10);

        if (JSON.stringify(tempGates) !== JSON.stringify(gates)) {
            setPresentState(s => ({...s, gates: tempGates}));
        }
    }, [gates, wires, setPresentState, customGates]);

    const handleSaveCustomGate = () => {
        const name = customGateName.trim().toUpperCase();
        if (!name || selectedGateIds.length === 0) { alert("Please enter a name and select at least one gate."); return; }

        const selection = gates.filter(g => selectedGateIds.includes(g.id));
        const inputs = selection.filter(g => g.type === 'INPUT').map(g => ({originalId: g.id, name: g.name})).sort((a,b) => gates.find(g=>g.id===a.originalId)!.position.y - gates.find(g=>g.id===b.originalId)!.position.y);
        const outputs = selection.filter(g => g.type === 'OUTPUT').map(g => ({originalId: g.id, name: g.name})).sort((a,b) => gates.find(g=>g.id===a.originalId)!.position.y - gates.find(g=>g.id===b.originalId)!.position.y);

        if (inputs.length === 0 || outputs.length === 0) { alert("A custom gate must have at least one INPUT and one OUTPUT gate in the selection."); return; }

        const internalGates = selection.filter(g => g.type !== 'INPUT' && g.type !== 'OUTPUT');
        const allInternalIds = [...internalGates.map(g => g.id), ...inputs.map(i => i.originalId), ...outputs.map(o => o.originalId)];
        const internalWires = wires.filter(w => allInternalIds.includes(w.from.gateId) && allInternalIds.includes(w.to.gateId));

        const minX = Math.min(...selection.map(g => g.position.x));
        const minY = Math.min(...selection.map(g => g.position.y));

        const template: CustomGateTemplate = {
            name: name,
            gates: [...internalGates, ...selection.filter(g => g.type === 'INPUT' || g.type === 'OUTPUT')].map(({value, ...g}) => ({ ...g, position: { x: g.position.x - minX, y: g.position.y - minY }})),
            wires: internalWires.map(({id, ...w}) => w),
            inputs,
            outputs
        };

        setCustomGates(prev => ({...prev, [name]: template}));
        setCustomGateName("");
        setSelectedGateIds([]);
    };

    const handleAddCustomGate = (name: string) => {
        const template = customGates[name];
        if (!template) return;
        const newGate: Gate = {
            id: `${name}-${Date.now()}`,
            type: 'CUSTOM',
            position: {x: 250, y: 150},
            value: false,
            customGateName: name,
            name: name,
            inputValues: Array(template.inputs.length).fill(false),
            outputValues: Array(template.outputs.length).fill(false),
        };
        setState(s => ({ ...s, gates: [...s.gates, newGate] }));
    };

    const handleDeleteCustomGate = (name: string) => { setCustomGates(prev => { const newCustomGates = {...prev}; delete newCustomGates[name]; return newCustomGates; }); };

    const handleShare = () => {
        const data = { gates, wires };
        const base64 = btoa(JSON.stringify(data));
        const url = `${window.location.origin}${window.location.pathname}?view=${base64}`;
        const code = `<iframe src="${url}" width="100%" height="500" style="border:1px solid #ccc; border-radius: 8px;" allowfullscreen></iframe>`;
        setEmbedCode(code);
        setShowShareModal(true);
    };

    const wireValues = useMemo(() => {
        const values = new Map<string, boolean>();
        wires.forEach(wire => {
            const fromGate = gates.find(g => g.id === wire.from.gateId);
            if (!fromGate) return;
            const value = fromGate.type === 'CUSTOM' ? (fromGate.outputValues?.[wire.from.portIndex] ?? false) : fromGate.value;
            values.set(wire.id, value);
        });
        return values;
    }, [wires, gates]);

    const isUpdating = customGateName.trim().toUpperCase() in customGates;

    const handleZoom = (direction: 'in' | 'out' | 'reset') => {
        if (direction === 'reset') {
            setViewTransform({ x: 0, y: 0, k: 1 });
            return;
        }
        if (!svgRef.current) return;
        const { clientWidth, clientHeight } = svgRef.current;
        const centerX = clientWidth / 2;
        const centerY = clientHeight / 2;

        const zoomFactor = 1.2;
        const newK = direction === 'in' ? viewTransform.k * zoomFactor : viewTransform.k / zoomFactor;
        const newX = centerX - (centerX - viewTransform.x) * (newK / viewTransform.k);
        const newY = centerY - (centerY - viewTransform.y) * (newK / viewTransform.k);
        setViewTransform({ x: newX, y: newY, k: newK });
    };

    return (
        <div className="w-screen h-screen bg-gray-800 flex flex-col font-sans text-white overflow-hidden">
            <header className="bg-gray-900 p-3 shadow-lg z-10 flex items-center justify-between flex-wrap gap-2">
                <h1 className="text-xl font-bold text-sky-400">Logic Gate Simulator</h1>
                {!isReadOnly && (
                    <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={() => addGate('INPUT')} className="bg-green-500 hover:bg-green-600 px-3 py-1 rounded-md font-semibold transition-colors">Add INPUT</button>
                        <button onClick={() => addGate('OUTPUT')} className="bg-purple-500 hover:bg-purple-600 px-3 py-1 rounded-md font-semibold transition-colors">Add OUTPUT</button>
                        <button onClick={() => addGate('AND')} className="bg-sky-500 hover:bg-sky-600 px-3 py-1 rounded-md font-semibold transition-colors">Add AND</button>
                        <button onClick={() => addGate('OR')} className="bg-teal-500 hover:bg-teal-600 px-3 py-1 rounded-md font-semibold transition-colors">Add OR</button>
                        <button onClick={() => addGate('NOT')} className="bg-indigo-500 hover:bg-indigo-600 px-3 py-1 rounded-md font-semibold transition-colors">Add NOT</button>
                        <button onClick={() => setState({gates: [], wires: []})} className="bg-red-500 hover:bg-red-600 px-3 py-1 rounded-md font-semibold transition-colors">Reset</button>
                        <button onClick={undo} disabled={!canUndo} className="disabled:opacity-50 disabled:cursor-not-allowed bg-gray-600 hover:bg-gray-700 px-3 py-1 rounded-md font-semibold transition-colors">Undo</button>
                        <button onClick={redo} disabled={!canRedo} className="disabled:opacity-50 disabled:cursor-not-allowed bg-gray-600 hover:bg-gray-700 px-3 py-1 rounded-md font-semibold transition-colors">Redo</button>
                        <button onClick={handleShare} className="bg-blue-500 hover:bg-blue-600 px-3 py-1 rounded-md font-semibold transition-colors">Share</button>
                    </div>
                )}
            </header>

            <main className="flex-grow relative">
                <svg width="100%" height="100%"
                     ref={svgRef}
                     onMouseDown={handleCanvasMouseDown}
                     onMouseMove={handleCanvasMouseMove}
                     onMouseUp={handleCanvasMouseUp}
                     onMouseLeave={handleCanvasMouseUp}
                     onWheel={handleWheel}
                     className={isPanning ? 'cursor-grabbing' : 'cursor-default'}
                >
                    <g transform={`translate(${viewTransform.x}, ${viewTransform.y}) scale(${viewTransform.k})`}>
                        <defs>
                            <pattern id="grid" width={20} height={20} patternUnits="userSpaceOnUse">
                                <path d={`M 20 0 L 0 0 0 20`} fill="none" stroke="rgba(128,128,128,0.2)" strokeWidth="1"/>
                            </pattern>
                        </defs>
                        <rect x={-viewTransform.x / viewTransform.k} y={-viewTransform.y / viewTransform.k} width="200%" height="200%" fill="url(#grid)" />

                        {wires.map(wire => (
                            <WireComponent key={wire.id} wire={wire} gates={gates} customGates={customGates} value={wireValues.get(wire.id) || false} />
                        ))}

                        {connecting && (
                            <line
                                x1={getPortPosition(gates.find(g => g.id === connecting.from.gateId)!, 'output', connecting.from.portIndex, customGates[gates.find(g=>g.id===connecting.from.gateId)!.customGateName!]).x}
                                y1={getPortPosition(gates.find(g => g.id === connecting.from.gateId)!, 'output', connecting.from.portIndex, customGates[gates.find(g=>g.id===connecting.from.gateId)!.customGateName!]).y}
                                x2={connecting.mousePos.x}
                                y2={connecting.mousePos.y}
                                className="stroke-yellow-400 stroke-2"
                            />
                        )}

                        {gates.map(gate => (
                            <GateComponent
                                key={gate.id}
                                gate={gate}
                                onDragStart={handleGateDragStart}
                                onDrag={handleGateDrag}
                                onDragEnd={handleGateDragEnd}
                                onPortClick={handlePortClick}
                                onPortDoubleClick={handlePortDoubleClick}
                                onClick={handleGateClick}
                                isSelected={selectedGateIds.includes(gate.id)}
                                customGateDef={gate.type === 'CUSTOM' ? customGates[gate.customGateName!] : undefined}
                                isReadOnly={isReadOnly}
                            />
                        ))}
                        {selectionBox && (
                            <rect
                                x={selectionBox.x}
                                y={selectionBox.y}
                                width={selectionBox.width}
                                height={selectionBox.height}
                                className="fill-sky-500/20 stroke-sky-500 stroke-2 stroke-dashed"
                            />
                        )}
                    </g>
                </svg>
                {!isReadOnly && (
                    <>
                        <div className="absolute top-4 right-4 bg-gray-900/80 p-4 rounded-lg text-sm flex flex-col gap-3 max-h-[80vh] overflow-y-auto">
                            <div>
                                <h2 className="text-lg font-bold text-amber-400 mb-2">Custom Gates</h2>
                                <div className="flex flex-col gap-2">
                                    {Object.keys(customGates).length === 0 && <p className="text-gray-400">No custom gates saved yet.</p>}
                                    {Object.keys(customGates).map(name => (
                                        <div key={name} className="flex items-center justify-between gap-2 bg-gray-800 p-2 rounded">
                                            <button onClick={() => handleAddCustomGate(name)} className="flex-grow text-left font-semibold text-white hover:text-amber-400 transition-colors">{name}</button>
                                            <button onClick={() => handleDeleteCustomGate(name)} className="text-red-500 hover:text-red-400 font-bold px-2">✕</button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            {selectedGateIds.length > 0 && (
                                <div>
                                    <h2 className="text-lg font-bold text-green-400 mb-2">Save Selection</h2>
                                    <p className="text-xs text-gray-400 mb-2">Include INPUT/OUTPUT gates in selection to define ports.</p>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={customGateName}
                                            onChange={(e) => setCustomGateName(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveCustomGate(); }}
                                            placeholder="Gate Name (e.g. NAND)"
                                            className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                                            onClick={e => e.stopPropagation()}
                                        />
                                        <button onClick={handleSaveCustomGate} className={`px-3 py-1 rounded-md font-semibold transition-colors ${isUpdating ? 'bg-amber-600 hover:bg-amber-700' : 'bg-green-600 hover:bg-green-700'}`}>
                                            {isUpdating ? 'Update' : 'Save'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="absolute bottom-4 left-4 bg-gray-900/80 p-3 rounded-lg text-sm flex flex-col gap-1">
                            <p><strong className="text-sky-400">How to use:</strong></p>
                            <p>• Drag on canvas to select multiple gates.</p>
                            <p>• Press <kbd>Esc</kbd> to cancel wiring.</p>
                            <p>• <kbd>Cmd/Ctrl + Z</kbd> to Undo, <kbd>Cmd/Ctrl + Y</kbd> to Redo.</p>
                            <p>• Double-click a connected input port to move the wire.</p>
                            <p>• <kbd>Shift</kbd> + Click to add/remove from selection.</p>
                            <p>• Select gates and press <kbd>Delete</kbd> to remove them.</p>
                        </div>
                    </>
                )}
                <div className="absolute bottom-4 right-4 bg-gray-900/80 p-1 rounded-lg flex items-center gap-1 text-white text-xs">
                    <button onClick={() => handleZoom('out')} className="w-7 h-7 font-bold text-lg flex items-center justify-center hover:bg-gray-700 rounded">-</button>
                    <button onClick={() => handleZoom('reset')} className="w-14 h-7 hover:bg-gray-700 rounded">{Math.round(viewTransform.k * 100)}%</button>
                    <button onClick={() => handleZoom('in')} className="w-7 h-7 font-bold text-lg flex items-center justify-center hover:bg-gray-700 rounded">+</button>
                </div>
                {showShareModal && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center" onClick={() => setShowShareModal(false)}>
                        <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
                            <h2 className="text-xl font-bold mb-4 text-sky-400">Embed Circuit</h2>
                            <p className="text-sm text-gray-300 mb-4">Copy this code and paste it into your blog or website's HTML to embed this circuit.</p>
                            <textarea
                                readOnly
                                value={embedCode}
                                className="w-full h-32 p-2 bg-gray-900 text-gray-200 border border-gray-700 rounded-md font-mono text-sm"
                                onFocus={e => e.target.select()}
                            />
                            <button onClick={() => setShowShareModal(false)} className="mt-4 bg-sky-500 hover:bg-sky-600 px-4 py-2 rounded-md font-semibold transition-colors">Close</button>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
